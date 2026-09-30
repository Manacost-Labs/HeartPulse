import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { seoPageForExactPath } from '../src/seo/registry';
import { seoStructuredDataGraph } from '../src/seo/structuredData';
import { normalizePublicPathname } from '../src/shared/seo/publicUrlPolicy';

const registry = JSON.parse(readFileSync('config/public-seo-structured-data.json', 'utf8')) as {
  pages: Record<string, Array<Record<string, unknown>>>;
};
const NOW = new Date('2026-09-30T12:00:00Z');
const byType = (graph: Array<Record<string, unknown>>, type: string) => graph.find(node => node['@type'] === type);

test('the home graph links its application to the breadcrumb and marks the language', async () => {
  const graph = (await seoStructuredDataGraph('/', NOW))!['@graph'];
  assert.deepEqual(graph.map(node => node['@type']), ['WebSite', 'WebApplication', 'BreadcrumbList', 'FAQPage']);
  assert.equal(byType(graph, 'BreadcrumbList')!['@id'], 'https://hearthpulse.net/#breadcrumb');
  assert.deepEqual(byType(graph, 'WebApplication')!.breadcrumb, { '@id': 'https://hearthpulse.net/#breadcrumb' });
  assert.equal(byType(graph, 'FAQPage')!.inLanguage, 'ru');
  assert.equal(byType(graph, 'WebSite')!.breadcrumb, undefined, 'the site node is not a page in the trail');
});

test('dataset pages describe the rolling 30-day window ending today', async () => {
  const dataset = byType((await seoStructuredDataGraph('/classes/', NOW))!['@graph'], 'Dataset')!;
  assert.equal(dataset.temporalCoverage, '2026-08-31/2026-09-30');
  assert.equal(dataset.dateModified, '2026-09-30');
  assert.equal(dataset.license, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(dataset.inLanguage, 'ru');
});

test('references to registered pages use their canonical trailing-slash URLs', async () => {
  const graph = (await seoStructuredDataGraph('/classes', NOW))!['@graph'];
  const trail = (byType(graph, 'BreadcrumbList')!.itemListElement as Array<{ item: string }>).map(entry => entry.item);
  assert.deepEqual(trail, ['https://hearthpulse.net/', 'https://hearthpulse.net/classes/']);
  assert.equal(byType(graph, 'BreadcrumbList')!['@id'], 'https://hearthpulse.net/classes/#breadcrumb');
});

test('every structured-data entry belongs to a registered SEO page and builds a graph', async () => {
  for (const [path, nodes] of Object.entries(registry.pages)) {
    assert.ok(seoPageForExactPath(path), `${path} must be listed in config/public-seo-pages.json`);
    const graph = await seoStructuredDataGraph(path, NOW);
    assert.deepEqual(graph?.['@graph'].map(node => node['@type']), nodes.map(node => node['@type']), path);
    assert.equal(JSON.stringify(nodes).includes('"breadcrumb":{"@id"'), false, `${path} registry stays unenriched`);
  }
});

const SITE_ORIGIN = 'https://hearthpulse.net';
const REQUIRED_STRINGS: Record<string, string[]> = {
  WebSite: ['name', 'url'], WebApplication: ['name', 'url'], CollectionPage: ['name', 'url'],
  Dataset: ['name', 'description', 'url', 'dateModified'],
};
const REQUIRED_LISTS: Record<string, string> = {
  BreadcrumbList: 'itemListElement', ItemList: 'itemListElement', FAQPage: 'mainEntity',
};

/** Every same-site `@id`, `item` and `url` must be the canonical URL of an indexable page. */
function assertCanonicalReferences(value: unknown, pagePath: string, key = ''): void {
  if (Array.isArray(value)) { value.forEach(item => assertCanonicalReferences(item, pagePath, key)); return; }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, child]) => assertCanonicalReferences(child, pagePath, childKey));
    return;
  }
  if (typeof value !== 'string' || !['@id', 'item', 'url'].includes(key) || !URL.canParse(value)) return;
  const reference = new URL(value);
  if (reference.origin !== SITE_ORIGIN) return;
  const path = normalizePublicPathname(reference.pathname);
  const target = seoPageForExactPath(path);
  if (!target) return;
  assert.equal(target.sitemap, true, `${pagePath} must not link the noindex page ${path}`);
  assert.equal(reference.pathname, path === '/' ? '/' : `${path}/`, `${pagePath} ${key} ${value}`);
}

test('every graph node carries the fields of its schema type and links canonical URLs', async () => {
  for (const path of Object.keys(registry.pages)) {
    const graph = (await seoStructuredDataGraph(path, NOW))!;
    assert.equal(graph['@context'], 'https://schema.org');
    for (const node of graph['@graph']) {
      const type = String(node['@type']);
      for (const field of REQUIRED_STRINGS[type] ?? []) {
        assert.equal(typeof node[field], 'string', `${path} ${type} ${field}`);
      }
      const list = REQUIRED_LISTS[type];
      if (list) assert.ok(Array.isArray(node[list]) && (node[list] as unknown[]).length > 0, `${path} ${type} ${list}`);
      if (type === 'Dataset') assert.equal(typeof node.creator, 'object', `${path} Dataset creator`);
    }
    assertCanonicalReferences(graph, path);
  }
});

test('pages without an entry, and the source registry itself, are left alone', async () => {
  assert.equal(await seoStructuredDataGraph('/standard/cards', NOW), null);
  assert.equal(await seoStructuredDataGraph('/no-such-page', NOW), null);
  await seoStructuredDataGraph('/classes', NOW);
  const dataset = registry.pages['/classes'].find(node => node['@type'] === 'Dataset')!;
  assert.equal(dataset.dateModified, undefined, 'building a graph must not mutate the registry');
});
