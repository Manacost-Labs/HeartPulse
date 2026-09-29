import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '..');
const registry = JSON.parse(readFileSync(resolve(projectRoot, 'config/public-seo-pages.json'), 'utf8'));
const routeInventory = JSON.parse(readFileSync(resolve(projectRoot, 'src/shared/seo/publicRouteInventory.json'), 'utf8'));

function buildStaticRoot(outDir) {
  const result = spawnSync(process.execPath, ['scripts/build-static-root.mjs', `--out=${outDir}`], {
    cwd: projectRoot, encoding: 'utf8',
  });
  assert.equal(result.status, 0, `static root build failed:\n${result.stdout}\n${result.stderr}`);
}

function locations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
}

test('static root is assembled from public assets and SEO registries without Vite', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'hearthpulse-static-root-'));
  const outDir = join(workspace, 'dist');
  try {
    buildStaticRoot(outDir);

    for (const asset of ['robots.txt', 'llms.txt', 'favicon.ico', 'runtime-config.js',
      'assets/og-preview.png', 'yandex_eaea2c59052dad81.html']) {
      assert.deepEqual(readFileSync(join(outDir, asset)), readFileSync(join(projectRoot, 'public', asset)),
        `${asset} must be copied from public/`);
    }
    for (const directory of ['fonts', 'wallpaper', 'bg-legacy']) {
      assert.ok(statSync(join(outDir, directory)).isDirectory(), `${directory}/ must be served from the static root`);
    }
    assert.equal(statSync(join(outDir, 'robots.txt')).mode & 0o777, 0o644);

    const entry = readFileSync(join(outDir, 'index.html'), 'utf8');
    assert.match(entry, /<meta name="robots" content="noindex, nofollow" \/>/,
      'the placeholder entry document must never be indexed');
    assert.doesNotMatch(entry, /<script\b/i, 'the placeholder entry document must not load an application');

    const sitemapIndex = readFileSync(join(outDir, 'sitemap.xml'), 'utf8');
    assert.deepEqual(locations(sitemapIndex), [
      `${routeInventory.canonicalOrigin}/sitemaps/static.xml`,
      `${routeInventory.canonicalOrigin}/sitemaps/standard-cards.xml`,
      `${routeInventory.canonicalOrigin}/sitemaps/wild-cards.xml`,
      `${routeInventory.canonicalOrigin}/sitemaps/battleground-minions.xml`,
      `${routeInventory.canonicalOrigin}/sitemaps/battleground-spells.xml`,
      `${routeInventory.canonicalOrigin}/sitemaps/battleground-heroes.xml`,
    ]);
    assert.doesNotMatch(sitemapIndex, /<(?:lastmod|changefreq|priority)>/i,
      'the sitemap index must not invent freshness metadata');

    const staticSitemap = readFileSync(join(outDir, 'sitemaps/static.xml'), 'utf8');
    const actualUrls = locations(staticSitemap).sort();
    const expectedUrls = Object.entries(registry.pages)
      .filter(([, page]) => page.sitemap)
      .map(([pathname]) => `${routeInventory.canonicalOrigin}${pathname === '/' ? '/' : `${pathname}/`}`)
      .sort();
    assert.deepEqual(actualUrls, expectedUrls, 'sitemap URLs must exactly match indexable registry pages');
    assert.equal(new Set(actualUrls).size, actualUrls.length, 'sitemap URLs must be unique');
    assert.doesNotMatch(staticSitemap, /[?&#](?:preview|page|sort)=/i, 'sitemap must not contain query URLs');
    assert.doesNotMatch(staticSitemap, /<(?:lastmod|changefreq|priority)>/i,
      'sitemap must not invent freshness metadata');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('static root keeps an existing legacy entry document and bundle', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'hearthpulse-static-root-legacy-'));
  const outDir = join(workspace, 'dist');
  try {
    mkdirSync(join(outDir, 'assets'), { recursive: true });
    const legacyEntry = '<!doctype html><script type="module" src="/assets/index-legacy.js"></script>\n';
    writeFileSync(join(outDir, 'index.html'), legacyEntry);
    writeFileSync(join(outDir, 'assets/index-legacy.js'), 'console.log("legacy");\n');

    buildStaticRoot(outDir);
    buildStaticRoot(outDir);

    assert.equal(readFileSync(join(outDir, 'index.html'), 'utf8'), legacyEntry);
    assert.equal(readFileSync(join(outDir, 'assets/index-legacy.js'), 'utf8'), 'console.log("legacy");\n');
    assert.ok(statSync(join(outDir, 'assets/og-preview.png')).isFile(), 'public assets share the assets/ directory');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
