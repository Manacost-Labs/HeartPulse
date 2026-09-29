import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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
function initialAssets(html) {
  return {
    js: [...new Set(html.match(/static\/chunks\/[\w\-./]+?\.js/g) ?? [])],
    css: [...new Set(html.match(/static\/(?:css|chunks)\/[\w\-./]+?\.css/g) ?? [])],
  };
}

function gzipBytes(files) {
  return files.reduce((total, file) => total + gzipSync(readFileSync(join(nextRoot, file)), { level: 6 }).length, 0);
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
    }
  } finally {
    await runtime.close();
  }

  if (process.env.NEXT_BUDGETS_WRITE === '1') {
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
