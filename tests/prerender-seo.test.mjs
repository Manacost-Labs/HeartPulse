import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const distDir = mkdtempSync(resolve(tmpdir(), 'manacost-prerender-seo-'));
const registry = JSON.parse(readFileSync(resolve(projectRoot, 'config/public-seo-pages.json'), 'utf8'));
const routeInventory = JSON.parse(readFileSync(resolve(projectRoot, 'config/public-route-inventory.json'), 'utf8'));
const homeSummaryFixture = resolve(distDir, 'home-summary-fixture.json');
const privateSentinels = [
  'QA_PRIVATE_DECK_CODE_AAECA_TEST_ONLY',
  'QA_PRIVATE_STATS_97_77',
  'QA_PRIVATE_SUBSCRIPTION_PAYLOAD',
];

function renderTemplate(value) {
  return String(value).replaceAll('{year}', String(new Date().getUTCFullYear()));
}

function outputPath(pathname) {
  return pathname === '/' ? 'index.html' : `${pathname.slice(1)}/index.html`;
}

function readOutput(path) {
  return readFileSync(resolve(distDir, path), 'utf8');
}

function matches(html, pattern) {
  return [...html.matchAll(pattern)];
}

function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertSingle(html, pattern, expected, label) {
  const found = matches(html, pattern);
  assert.equal(found.length, 1, `${label} must occur exactly once`);
  if (expected !== undefined) assert.equal(found[0][1], expected, label);
}

function assertNoSensitiveBootstrap(html, label) {
  assert.doesNotMatch(
    html,
    /\b(?:deckCode|statsAccess|subscriptionPayload)\b/,
    `${label} must not contain gated payload fields`,
  );
  for (const sentinel of privateSentinels) {
    assert.doesNotMatch(html, new RegExp(escapePattern(sentinel)), `${label} leaked ${sentinel}`);
  }
}

function normalizePathname(pathname) {
  return String(pathname || '/').replace(/\/+$/, '') || '/';
}

function assertSchemaPageReferences(value, pathname, canonical, parentKey = '') {
  if (Array.isArray(value)) {
    value.forEach(item => assertSchemaPageReferences(item, pathname, canonical, parentKey));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => assertSchemaPageReferences(child, pathname, canonical, key));
    return;
  }
  if (typeof value !== 'string' || !['@id', 'item', 'url'].includes(parentKey)) return;
  let reference;
  try {
    reference = new URL(value);
  } catch {
    return;
  }
  if (reference.origin !== routeInventory.canonicalOrigin) return;
  const referencePath = normalizePathname(reference.pathname);
  const materializedPage = registry.pages[referencePath];
  if (!materializedPage && referencePath !== normalizePathname(pathname)) return;
  if (materializedPage) {
    assert.equal(materializedPage.sitemap, true, `${pathname} must not link noindex schema target ${referencePath}`);
  }
  const expectedCanonical = referencePath === normalizePathname(pathname)
    ? canonical
    : `${routeInventory.canonicalOrigin}${referencePath === '/' ? '/' : `${referencePath}/`}`;
  assert.equal(
    reference.href,
    `${expectedCanonical}${reference.search}${reference.hash}`,
    `${pathname} schema ${parentKey}`,
  );
}

function assertSchemaNode(node, pathname) {
  assert.equal(typeof node['@type'], 'string', `${pathname} schema node must declare @type`);
  if (['WebSite', 'WebApplication', 'CollectionPage'].includes(node['@type'])) {
    assert.equal(typeof node.name, 'string', `${pathname} ${node['@type']} name`);
    assert.equal(typeof node.url, 'string', `${pathname} ${node['@type']} url`);
  }
  if (node['@type'] === 'Dataset') {
    for (const field of ['name', 'description', 'url', 'dateModified']) {
      assert.equal(typeof node[field], 'string', `${pathname} Dataset ${field}`);
    }
    assert.equal(typeof node.creator, 'object', `${pathname} Dataset creator`);
  }
  if (node['@type'] === 'BreadcrumbList') {
    assert.ok(Array.isArray(node.itemListElement) && node.itemListElement.length > 0, `${pathname} breadcrumbs`);
  }
  if (node['@type'] === 'ItemList') {
    assert.ok(Array.isArray(node.itemListElement) && node.itemListElement.length > 0, `${pathname} ItemList items`);
  }
  if (node['@type'] === 'FAQPage') {
    assert.ok(Array.isArray(node.mainEntity) && node.mainEntity.length > 0, `${pathname} FAQPage questions`);
  }
}

function assertIndexDocument(html, pathname, page) {
  const title = renderTemplate(page.title);
  const description = renderTemplate(page.description);
  const canonical = `${routeInventory.canonicalOrigin}${pathname === '/' ? '/' : `${pathname}/`}`;

  assertSingle(html, /<title>([^<]*)<\/title>/gi, title, `${pathname} title`);
  assertSingle(html, /<meta name="description" content="([^"]*)"/gi, description, `${pathname} description`);
  assertSingle(
    html,
    /<meta name="robots" content="([^"]*)"/gi,
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    `${pathname} robots`,
  );
  assertSingle(html, /<link rel="canonical" href="([^"]*)"/gi, canonical, `${pathname} canonical`);
  assertSingle(html, /<meta property="og:title" content="([^"]*)"/gi, title, `${pathname} og:title`);
  assertSingle(html, /<meta property="og:description" content="([^"]*)"/gi, description, `${pathname} og:description`);
  assertSingle(html, /<meta property="og:url" content="([^"]*)"/gi, canonical, `${pathname} og:url`);
  assertSingle(html, /<meta name="twitter:title" content="([^"]*)"/gi, title, `${pathname} twitter:title`);
  assertSingle(html, /<meta name="twitter:description" content="([^"]*)"/gi, description, `${pathname} twitter:description`);
  assert.equal(matches(html, /<h1(?:\s[^>]*)?>/gi).length, 1, `${pathname} must expose exactly one H1`);
  for (const script of matches(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    const schema = JSON.parse(script[1]);
    assert.equal(schema['@context'], 'https://schema.org', `${pathname} JSON-LD context`);
    assert.ok(Array.isArray(schema['@graph']) && schema['@graph'].length > 0, `${pathname} JSON-LD graph`);
    schema['@graph'].forEach(node => assertSchemaNode(node, pathname));
    assertSchemaPageReferences(schema, pathname, canonical);
  }
  assertNoSensitiveBootstrap(html, pathname);
}

function assertNoindexDocument(html, label, page) {
  assertSingle(html, /<title>([^<]*)<\/title>/gi, page ? renderTemplate(page.title) : undefined, `${label} title`);
  assertSingle(
    html,
    /<meta name="description" content="([^"]*)"/gi,
    page ? renderTemplate(page.description) : undefined,
    `${label} description`,
  );
  assertSingle(html, /<meta name="robots" content="([^"]*)"/gi, 'noindex, nofollow', `${label} robots`);
  assert.doesNotMatch(html, /<link rel="canonical"/i, `${label} must not expose a canonical URL`);
  assert.doesNotMatch(html, /<meta property="og:url"/i, `${label} must not expose og:url`);
  assert.doesNotMatch(html, /application\/ld\+json/i, `${label} must not retain stale structured data`);
  assert.equal(matches(html, /<h1(?:\s[^>]*)?>/gi).length, 1, `${label} must expose exactly one H1`);
  assertNoSensitiveBootstrap(html, label);
}

try {
  copyFileSync(resolve(projectRoot, 'index.html'), resolve(distDir, 'index.html'));
  writeFileSync(homeSummaryFixture, JSON.stringify({
    updatedAt: '2026-07-21T00:00:00.000Z',
    topClasses: [{
      id: 'qa-public-class',
      name: 'QA_PUBLIC_CLASS_SUMMARY',
      winrate: 51.23,
      games: 1234,
      internalDeckCode: privateSentinels[0],
    }],
    internal: {
      unpublishedMetric: privateSentinels[1],
      subscriptionPayload: privateSentinels[2],
    },
  }), 'utf8');

  const result = spawnSync(process.execPath, ['scripts/prerender.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PRERENDER_DIST_DIR: distDir,
      PRERENDER_HOME_SUMMARY_FIXTURE: homeSummaryFixture,
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `prerender failed:\n${result.stdout}\n${result.stderr}`);
  assert.match(readOutput('index.html'), /QA_PUBLIC_CLASS_SUMMARY/, 'public fixture data must reach home summary');

  for (const [pathname, page] of Object.entries(registry.pages)) {
    const html = readOutput(outputPath(pathname));
    if (page.sitemap) assertIndexDocument(html, pathname, page);
    else assertNoindexDocument(html, `${pathname} prerender`, page);
  }
  const notFoundHtml = readOutput('404.html');
  assertNoindexDocument(notFoundHtml, '404 fallback');
  assert.match(notFoundHtml, /<div id="root" data-route-status="404">/, '404 fallback must identify itself to the client router');
  assert.doesNotMatch(readOutput('index.html'), /data-route-status="404"/, 'ordinary pages must not carry the 404 client marker');

  const sitemapIndex = readOutput('sitemap.xml');
  assert.match(sitemapIndex, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
    'the canonical sitemap endpoint artifact must describe the runtime segment index');
  assert.deepEqual(matches(sitemapIndex, /<loc>([^<]+)<\/loc>/g).map(match => match[1]), [
    `${routeInventory.canonicalOrigin}/sitemaps/static.xml`,
    `${routeInventory.canonicalOrigin}/sitemaps/standard-cards.xml`,
  ]);
  assert.doesNotMatch(sitemapIndex, /<(?:lastmod|changefreq|priority)>/i,
    'the sitemap index must not invent freshness metadata');

  const staticSitemap = readOutput('sitemaps/static.xml');
  const actualUrls = matches(staticSitemap, /<loc>([^<]+)<\/loc>/g).map(match => match[1]).sort();
  const expectedUrls = Object.entries(registry.pages)
    .filter(([, page]) => page.sitemap)
    .map(([pathname]) => `${routeInventory.canonicalOrigin}${pathname === '/' ? '/' : `${pathname}/`}`)
    .sort();
  assert.deepEqual(actualUrls, expectedUrls, 'sitemap URLs must exactly match materialized registry pages');
  assert.equal(new Set(actualUrls).size, actualUrls.length, 'sitemap URLs must be unique');
  assert.equal(actualUrls.length, 24, 'the static segment must include all 24 canonical pages');
  assert.doesNotMatch(staticSitemap, /[?&#](?:preview|page|sort)=/i, 'sitemap must not contain query URLs');
  assert.doesNotMatch(staticSitemap, new RegExp(`${escapePattern(routeInventory.canonicalOrigin)}/(?:admin|404)/`));
  assert.doesNotMatch(staticSitemap, /<(?:lastmod|changefreq|priority)>/i, 'sitemap must not invent freshness metadata');
} finally {
  rmSync(distDir, { recursive: true, force: true });
}

console.log(`prerender SEO assertions passed (${Object.keys(registry.pages).length} materialized pages)`);
