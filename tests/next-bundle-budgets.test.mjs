import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const nextRoot = join(projectRoot, 'apps/public-web/.next');
const budgetsPath = join(projectRoot, 'config/next-bundle-budgets.json');
const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));

// Every chunk the server-rendered document references, including the React
// Server Components payload, is fetched before the page becomes interactive.
// Chunks loaded later by `next/dynamic` or `React.lazy` are not counted, and
// the `noModule` polyfill bundle is skipped because modern browsers never load
// it. Dynamic route segments appear URL-encoded (`%5Bformat%5D`).
function initialAssets(html) {
  const unique = matches => [...new Set((matches ?? []).map(file => decodeURIComponent(file)))];
  return {
    js: unique(html.match(/static\/chunks\/[\w\-./%]+?\.js/g))
      .filter(file => !/^static\/chunks\/polyfills-/.test(file)),
    css: unique(html.match(/static\/(?:css|chunks)\/[\w\-./%]+?\.css/g)),
  };
}

function gzipBytes(files) {
  return files.reduce((total, file) => total + gzipSync(readFileSync(join(nextRoot, file)), { level: 6 }).length, 0);
}

// The administrator workspace shell must stay a lazy asset of the admin page.
const ADMIN_SHELL_MARKERS = { js: 'admin-primary-navigation', css: '--admin-nav-w:' };
function adminShellAssets(assets) {
  return ['js', 'css'].flatMap(kind => assets[kind]
    .filter(file => readFileSync(join(nextRoot, file), 'utf8').includes(ADMIN_SHELL_MARKERS[kind])));
}

// Guests on the Battlegrounds routes see only the gate: the paid views and
// their stylesheet are lazy assets that load once access is confirmed.
const PAID_BATTLEGROUNDS_MARKERS = { js: ['bg-heroes-page', 'bg-library-page'], css: ['.bg-hero-ledger'] };
const PAID_BATTLEGROUNDS_ROUTES = ['/heroes/', '/library/', '/battlegrounds/tier-builder/',
  '/battlegrounds/strategies/', '/battlegrounds/tier-list/'];
function paidBattlegroundsAssets(assets) {
  return ['js', 'css'].flatMap(kind => assets[kind].filter(file => {
    const source = readFileSync(join(nextRoot, file), 'utf8');
    return PAID_BATTLEGROUNDS_MARKERS[kind].some(marker => source.includes(marker));
  }));
}

test('initial Next.js JavaScript and CSS of public routes stay within their budgets', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  const measured = {};
  try {
    for (const path of Object.keys(budgets.routes)) {
      const response = await fetch(`${runtime.nextOrigin}${path}`);
      assert.equal(response.status, 200, `${path} must render`);
      const assets = initialAssets(await response.text());
      measured[path] = { jsGzipBytes: gzipBytes(assets.js), cssGzipBytes: gzipBytes(assets.css) };
      assert.deepEqual(adminShellAssets(assets), [], `${path} must not load the administrator workspace shell`);
    }

    for (const path of PAID_BATTLEGROUNDS_ROUTES) {
      const response = await fetch(`${runtime.nextOrigin}${path}`);
      assert.equal(response.status, 200, `${path} must render`);
      assert.deepEqual(paidBattlegroundsAssets(initialAssets(await response.text())), [],
        `${path} must not load the paid Battlegrounds view before access is confirmed`);
    }

    const adminResponse = await fetch(`${runtime.nextOrigin}/admin/`);
    assert.equal(adminResponse.status, 200, 'a visitor gets the sign-in prompt of /admin/');
    assert.deepEqual(adminShellAssets(initialAssets(await adminResponse.text())), [],
      'a visitor without administrator access must not download the workspace shell either');

    // The markers must exist in the build, or the two checks above prove nothing.
    const built = readdirSync(join(nextRoot, 'static'), { recursive: true });
    for (const kind of ['js', 'css']) {
      assert.ok(built.some(file => file.endsWith(`.${kind}`)
        && readFileSync(join(nextRoot, 'static', file), 'utf8').includes(ADMIN_SHELL_MARKERS[kind])),
      `no built ${kind} file contains "${ADMIN_SHELL_MARKERS[kind]}": update the administrator shell marker`);
      for (const marker of PAID_BATTLEGROUNDS_MARKERS[kind]) {
        assert.ok(built.some(file => file.endsWith(`.${kind}`)
          && readFileSync(join(nextRoot, 'static', file), 'utf8').includes(marker)),
        `no built ${kind} file contains "${marker}": update the paid Battlegrounds marker`);
      }
    }
  } finally {
    await runtime.close();
  }

  if (process.env.NEXT_BUDGETS_WRITE === '1') {
    assert.ok(!process.env.CI, 'budgets are rewritten only locally, never in CI');
    const ceiling = bytes => Math.ceil((bytes * 1.02) / 1024) * 1024;
    const routes = Object.fromEntries(Object.entries(measured).map(([path, sizes]) => [path, {
      jsGzipBytes: ceiling(sizes.jsGzipBytes), cssGzipBytes: ceiling(sizes.cssGzipBytes),
    }]));
    writeFileSync(budgetsPath, `${JSON.stringify({ ...budgets, routes }, null, 2)}\n`);
    return;
  }

  const exceeded = Object.entries(budgets.routes).flatMap(([path, limits]) => ['jsGzipBytes', 'cssGzipBytes']
    .filter(key => measured[path][key] > limits[key])
    .map(key => `${path} ${key}: ${measured[path][key]} > ${limits[key]}`));
  assert.deepEqual(exceeded, [], `measured: ${JSON.stringify(measured)}`);
});
