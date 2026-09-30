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

// A throwaway directory plays the checkout, so a broken guard can only empty
// the fixture. It has the registries, so an accepted build really runs.
function fixtureCheckout(workspace) {
  const checkout = join(workspace, 'checkout');
  mkdirSync(join(checkout, 'public/fonts'), { recursive: true });
  mkdirSync(join(checkout, 'src/shared/seo'), { recursive: true });
  mkdirSync(join(checkout, 'config'));
  writeFileSync(join(checkout, 'src/shared/seo/publicRouteInventory.json'), JSON.stringify(routeInventory));
  writeFileSync(join(checkout, 'config/public-seo-pages.json'), JSON.stringify(registry));
  for (const file of ['public/robots.txt', 'public/fonts/font.woff2', 'src/module.ts']) {
    writeFileSync(join(checkout, file), 'kept\n');
  }
  return checkout;
}

function buildIn(checkout, out) {
  return spawnSync(process.execPath, [join(projectRoot, 'scripts/build-static-root.mjs'), ...(out ? [`--out=${out}`] : [])], {
    cwd: checkout, encoding: 'utf8',
  });
}

function markAsStaticRoot(directory) {
  writeFileSync(join(directory, 'index.html'), 'kept\n');
  writeFileSync(join(directory, 'sitemap.xml'), 'kept\n');
}

test('the build never empties the checkout, a directory that holds it, or public/', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'hearthpulse-static-root-guard-'));
  try {
    const checkout = fixtureCheckout(workspace);
    symlinkSync(checkout, join(workspace, 'link-to-checkout'));
    // Every directory looks like an earlier static root: only its location protects it.
    const protectedDirectories = [workspace, checkout, join(checkout, 'public'), join(checkout, 'public/fonts')];
    for (const directory of protectedDirectories) markAsStaticRoot(directory);
    const sentinels = ['public/robots.txt', 'public/fonts/font.woff2', 'src/module.ts'].map(file => join(checkout, file))
      .concat(protectedDirectories.map(directory => join(directory, 'index.html')));

    for (const out of ['.', '..', workspace, 'public', 'public/fonts',
      join(workspace, 'link-to-checkout'), join(workspace, 'link-to-checkout/public')]) {
      const result = buildIn(checkout, out);
      assert.notEqual(result.status, 0, `--out=${out} must be rejected`);
      assert.match(result.stderr, /refusing to empty .*: it holds the checkout or lies inside public\//, `--out=${out}`);
      for (const sentinel of sentinels) {
        assert.equal(readFileSync(sentinel, 'utf8'), 'kept\n', `--out=${out} must not delete ${sentinel}`);
      }
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('the build empties only a directory that is an earlier static root', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'hearthpulse-static-root-guard-'));
  try {
    const checkout = fixtureCheckout(workspace);
    mkdirSync(join(workspace, 'unrelated'));
    writeFileSync(join(workspace, 'unrelated/notes.txt'), 'kept\n');
    writeFileSync(join(workspace, 'file'), 'kept\n');

    for (const out of ['src', join(workspace, 'unrelated'), join(workspace, 'file')]) {
      const result = buildIn(checkout, out);
      assert.notEqual(result.status, 0, `--out=${out} must be rejected`);
      assert.match(result.stderr, /refusing to empty .*: it is not an earlier static root/, `--out=${out}`);
    }
    for (const kept of [join(checkout, 'src/module.ts'), join(workspace, 'unrelated/notes.txt'), join(workspace, 'file')]) {
      assert.equal(readFileSync(kept, 'utf8'), 'kept\n');
    }

    // An absent directory, an empty one and an earlier static root are all rebuilt.
    mkdirSync(join(workspace, 'empty'));
    mkdirSync(join(workspace, 'earlier'));
    markAsStaticRoot(join(workspace, 'earlier'));
    writeFileSync(join(workspace, 'earlier/stale.txt'), 'stale\n');
    for (const out of [join(workspace, 'absent'), join(workspace, 'empty'), join(workspace, 'earlier')]) {
      const result = buildIn(checkout, out);
      assert.equal(result.status, 0, `--out=${out}: ${result.stderr}`);
      assert.deepEqual(readdirSync(out).sort(), ['fonts', 'index.html', 'robots.txt', 'sitemap.xml', 'sitemaps']);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('a failed build leaves the earlier static root in place and can be repeated', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'hearthpulse-static-root-failed-'));
  try {
    const checkout = fixtureCheckout(workspace);
    assert.equal(buildIn(checkout).status, 0);
    writeFileSync(join(checkout, 'dist/earlier.txt'), 'earlier\n');

    // A sitemap page that no route can make canonical stops the sitemap generation.
    const broken = { ...registry, pages: { ...registry.pages, '/no-such-public-page': {
      policyRouteId: 'missing', title: 'A page without a route', sitemap: true,
      description: 'The registry lists this page for the sitemap, but no route gives it a canonical URL.',
    } } };
    writeFileSync(join(checkout, 'config/public-seo-pages.json'), JSON.stringify(broken));
    const failed = buildIn(checkout);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Sitemap page has no canonical URL: \/no-such-public-page/);
    assert.equal(readFileSync(join(checkout, 'dist/earlier.txt'), 'utf8'), 'earlier\n',
      'a build that cannot finish must not empty the earlier static root');

    writeFileSync(join(checkout, 'config/public-seo-pages.json'), JSON.stringify(registry));
    const repeated = buildIn(checkout);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(existsSync(join(checkout, 'dist/earlier.txt')), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
