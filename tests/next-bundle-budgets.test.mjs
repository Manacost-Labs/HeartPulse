import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  RELEASE_ID_PATTERN, evaluateBudgets, loadBudgetConfig, measurementReport, normalizedGzipBytes, writeMeasurements,
} from '../scripts/next-bundle-budgets.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const nextRoot = join(projectRoot, 'apps/public-web/.next');
const budgets = loadBudgetConfig(projectRoot);
const CARD_GALLERY_MARKER = 'img[data-card-image-src]';
const ARCHETYPE_ANALYSIS_MARKER = 'constructed-analysis-stack';

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

// Measured exactly like CI: normalized for the release SHA, then gzip level 6.
function gzipBytes(files) {
  return files.reduce((total, file) => total + normalizedGzipBytes(readFileSync(join(nextRoot, file), 'utf8')), 0);
}

// The administrator workspace shell must stay a lazy asset of the admin page.
const ADMIN_SHELL_MARKERS = { js: 'hp-admin-sidebar-collapsed', css: '.admin-console-search' };
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
  assert.deepEqual(budgets.errors, [], 'the budget baselines and approvals must be valid');
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  const measured = {};
  try {
    for (const path of Object.keys(budgets.baselines)) {
      const response = await fetch(`${runtime.nextOrigin}${path}`);
      assert.equal(response.status, 200, `${path} must render`);
      const assets = initialAssets(await response.text());
      measured[path] = { jsGzipBytes: gzipBytes(assets.js), cssGzipBytes: gzipBytes(assets.css) };
      assert.deepEqual(adminShellAssets(assets), [], `${path} must not load the administrator workspace shell`);
      if (path === '/standard/archetypes/') {
        assert.deepEqual(assets.js.filter(file => readFileSync(join(nextRoot, file), 'utf8').includes(CARD_GALLERY_MARKER)), [],
          'the archetype page must not load the card gallery observer');
        assert.deepEqual(assets.js.filter(file => readFileSync(join(nextRoot, file), 'utf8').includes(ARCHETYPE_ANALYSIS_MARKER)), [],
          'the catalog must defer the optional archetype analysis code');
      }
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
    assert.ok(built.some(file => file.endsWith('.js')
      && new RegExp(RELEASE_ID_PATTERN.source).test(readFileSync(join(nextRoot, 'static', file), 'utf8'))),
    'no built JavaScript contains the release id literal: update RELEASE_ID_PATTERN or measurements depend on the SHA');
    assert.ok(built.some(file => file.endsWith('.js')
      && readFileSync(join(nextRoot, 'static', file), 'utf8').includes(CARD_GALLERY_MARKER)),
    'no built JavaScript contains the gallery observer marker: update the marker');
    assert.ok(built.some(file => file.endsWith('.js')
      && readFileSync(join(nextRoot, 'static', file), 'utf8').includes(ARCHETYPE_ANALYSIS_MARKER)),
    'the optional analysis code must remain available in the build');
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

  // CI uploads this report; `npm run budget:next:baseline` adopts it from main.
  writeMeasurements(measurementReport(measured), projectRoot);
  const { failures } = evaluateBudgets({ ...budgets, measured });
  assert.deepEqual(failures, [], `measured: ${JSON.stringify(measured)}`);
});
