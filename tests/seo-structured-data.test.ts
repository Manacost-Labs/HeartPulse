import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { seoPageForExactPath } from '../src/seo/registry';
import { seoStructuredDataGraph } from '../src/seo/structuredData';

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

test('pages without an entry, and the source registry itself, are left alone', async () => {
  assert.equal(await seoStructuredDataGraph('/standard/cards', NOW), null);
  assert.equal(await seoStructuredDataGraph('/no-such-page', NOW), null);
  await seoStructuredDataGraph('/classes', NOW);
  const dataset = registry.pages['/classes'].find(node => node['@type'] === 'Dataset')!;
  assert.equal(dataset.dateModified, undefined, 'building a graph must not mutate the registry');
});
