import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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

test('static root is assembled from public assets and SEO registries', () => {
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
    assert.doesNotMatch(staticSitemap, new RegExp(`${routeInventory.canonicalOrigin.replaceAll('.', '\\.')}/(?:admin|404)/`),
      'private and error documents must stay out of the sitemap');
    assert.doesNotMatch(staticSitemap, /<(?:lastmod|changefreq|priority)>/i,
      'sitemap must not invent freshness metadata');

    // Every edge refuses to activate a tree below the activator's floor, so a
    // cleanup of public/ must not bring the static root close to it.
    const activator = readFileSync(join(projectRoot, 'deploy/activate-arena-static.sh'), 'utf8');
    const floor = name => Number(activator.match(new RegExp(`${name}:-(\\d+)`))[1]);
    const files = readdirSync(outDir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
    const bytes = files.reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0);
    assert.ok(files.length >= floor('ARENA_STATIC_MIN_FILES') * 1.2,
      `static root has ${files.length} files, too close to the edge activation floor`);
    assert.ok(bytes >= floor('ARENA_STATIC_MIN_BYTES') * 1.2,
      `static root has ${bytes} bytes, too close to the edge activation floor`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('static root is rebuilt from scratch in a reused workspace', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'hearthpulse-static-root-stale-'));
  const outDir = join(workspace, 'dist');
  try {
    mkdirSync(join(outDir, 'assets'), { recursive: true });
    writeFileSync(join(outDir, 'index.html'), '<!doctype html><script type="module" src="/assets/index-stale.js"></script>\n');
    writeFileSync(join(outDir, 'sitemap.xml'), '<sitemapindex/>\n');
    writeFileSync(join(outDir, 'assets/index-stale.js'), 'console.log("stale");\n');
    writeFileSync(join(outDir, '404.html'), '<!doctype html>stale\n');

    buildStaticRoot(outDir);

    assert.doesNotMatch(readFileSync(join(outDir, 'index.html'), 'utf8'), /<script\b/i,
      'an earlier entry document must not survive');
    assert.equal(existsSync(join(outDir, 'assets/index-stale.js')), false, 'an earlier bundle must not ship again');
    assert.equal(existsSync(join(outDir, '404.html')), false);
    assert.ok(statSync(join(outDir, 'assets/og-preview.png')).isFile(), 'public assets share the assets/ directory');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('the build empties only a directory that is an earlier static root', () => {
  // A throwaway directory plays the checkout, so a broken guard can only empty the fixture.
  const workspace = mkdtempSync(join(tmpdir(), 'hearthpulse-static-root-guard-'));
  const checkout = join(workspace, 'checkout');
  try {
    mkdirSync(join(checkout, 'public/fonts'), { recursive: true });
    mkdirSync(join(checkout, 'src'));
    mkdirSync(join(workspace, 'unrelated'));
    symlinkSync(checkout, join(workspace, 'link-to-checkout'));
    const sentinels = ['sentinel', 'public/robots.txt', 'public/fonts/font.woff2', 'src/module.ts']
      .map(file => join(checkout, file)).concat(join(workspace, 'unrelated/notes.txt'));
    for (const sentinel of sentinels) writeFileSync(sentinel, 'kept\n');
    for (const out of ['.', '..', workspace, 'public', 'public/fonts', 'src',
      join(workspace, 'unrelated'), join(workspace, 'link-to-checkout'), join(workspace, 'link-to-checkout/public')]) {
      const result = spawnSync(process.execPath, [join(projectRoot, 'scripts/build-static-root.mjs'), `--out=${out}`], {
        cwd: checkout, encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, `--out=${out} must be rejected`);
      assert.match(result.stderr, /refusing to empty/, `--out=${out}`);
      for (const sentinel of sentinels) {
        assert.equal(readFileSync(sentinel, 'utf8'), 'kept\n', `--out=${out} must not delete ${sentinel}`);
      }
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
