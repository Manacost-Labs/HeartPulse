import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { seoPageForExactPath } from '../src/seo/registry';
import { seoStructuredDataGraph, seoStructuredDataGraphOf } from '../src/seo/structuredData';
import { buildCollectionStructuredData, buildEntityStructuredData } from '../shared/entitySeoStructuredData';
import { buildCosmeticStructuredData } from '../shared/cosmeticsSeoStructuredData';
import { ORGANIZATION_ID, organizationNode } from '../shared/seoOrganization';
import { buildGuideStructuredData } from '../apps/public-web/lib/publicGuideTeaserStructuredData';
import { normalizePublicPathname } from '../src/shared/seo/publicUrlPolicy';
import { hsguruSourceUrl } from '../apps/public-web/lib/seoDataSource';

const registry = JSON.parse(readFileSync('config/public-seo-structured-data.json', 'utf8')) as {
  pages: Record<string, Array<Record<string, unknown>>>;
};
const UPDATED_AT = '2026-10-28T23:00:04Z';
const byType = (graph: Array<Record<string, unknown>>, type: string) => graph.find(node => node['@type'] === type);

test('the home graph links its page to the site and the breadcrumb and marks the language', async () => {
  const graph = (await seoStructuredDataGraph('/'))!['@graph'];
  assert.deepEqual(graph.map(node => node['@type']), ['Organization', 'WebSite', 'WebPage', 'BreadcrumbList']);
  assert.equal(byType(graph, 'BreadcrumbList')!['@id'], 'https://hearthpulse.net/#breadcrumb');
  assert.deepEqual(byType(graph, 'WebPage')!.breadcrumb, { '@id': 'https://hearthpulse.net/#breadcrumb' });
  assert.deepEqual(byType(graph, 'WebPage')!.isPartOf, { '@id': 'https://hearthpulse.net/#website' });
  const site = byType(graph, 'WebSite')!;
  assert.deepEqual(site.publisher, { '@id': ORGANIZATION_ID }, 'the site points at the organization node, it does not nest a copy');
  assert.equal(site.alternateName, undefined);
  const homeSeo = seoPageForExactPath('/')!;
  assert.equal(site.description, homeSeo.description, 'the site says what the meta description of the home page says');
  assert.equal(byType(graph, 'WebPage')!.description, homeSeo.description);
  assert.equal(byType(graph, 'FAQPage'), undefined, 'FAQ belongs on the dedicated help page');
  assert.equal(byType(graph, 'WebSite')!.breadcrumb, undefined, 'the site node is not a page in the trail');
});

test('a dataset is dated by its data, never by the clock of the server', async () => {
  const dataset = byType((await seoStructuredDataGraph('/standard/archetypes/', { dateModified: UPDATED_AT }))!['@graph'], 'Dataset')!;
  assert.equal(dataset.dateModified, '2026-10-28T23:00:04.000Z', 'the full instant the source gave');
  assert.equal('license' in dataset, false, 'the site terms are not a licence for the data');
  assert.equal('creator' in dataset, false, 'the site is not the creator of data it derives from other sources');
  assert.equal(dataset.inLanguage, 'ru');
  for (const facts of [{}, { dateModified: null }, { dateModified: '' }, { dateModified: 'вчера' }]) {
    const undated = byType((await seoStructuredDataGraph('/standard/archetypes/', facts))!['@graph'], 'Dataset')!;
    assert.equal('dateModified' in undated, false, `no public date, no dateModified: ${JSON.stringify(facts)}`);
  }
});

test('the meta page describes its teaser as a dataset and dates the page by it', async () => {
  const dated = (await seoStructuredDataGraph('/standard/meta/', { dateModified: UPDATED_AT }))!['@graph'];
  assert.deepEqual(dated.map(node => node['@type']), ['Organization', 'BreadcrumbList', 'CollectionPage', 'Dataset']);
  const collection = byType(dated, 'CollectionPage')!;
  const dataset = byType(dated, 'Dataset')!;
  assert.equal(dataset['@id'], 'https://hearthpulse.net/standard/meta/#dataset');
  assert.deepEqual(collection.about, { '@id': 'https://hearthpulse.net/standard/meta/#dataset' });
  assert.equal(collection.dateModified, '2026-10-28T23:00:04.000Z');
  assert.equal(dataset.dateModified, '2026-10-28T23:00:04.000Z');
  assert.deepEqual(dataset.isBasedOn, { '@type': 'Dataset', name: 'HSGuru: Meta', url: 'https://www.hsguru.com/meta' });
  assert.deepEqual(dataset.variableMeasured, [
    { '@type': 'PropertyValue', name: 'Винрейт', unitText: '%' },
    { '@type': 'PropertyValue', name: 'Популярность', unitText: '%' },
    { '@type': 'PropertyValue', name: 'Число игр' },
  ]);

  const undated = (await seoStructuredDataGraph('/standard/meta/'))!['@graph'];
  assert.equal('dateModified' in byType(undated, 'CollectionPage')!, false);
  assert.equal('dateModified' in byType(undated, 'Dataset')!, false);
});

test('the source address of the page replaces the registry one, but only an https address', async () => {
  const origin = async (sourceUrl: string | null) =>
    byType((await seoStructuredDataGraph('/standard/meta/', { sourceUrl }))!['@graph'], 'Dataset')!.isBasedOn;
  assert.deepEqual(await origin('https://www.hsguru.com/meta?format=2&min_games=100'),
    { '@type': 'Dataset', name: 'HSGuru: Meta', url: 'https://www.hsguru.com/meta?format=2&min_games=100' });
  for (const unsafe of [null, '', 'http://www.hsguru.com/meta', 'javascript:alert(1)', 'not an address']) {
    assert.equal((await origin(unsafe) as { url: string }).url, 'https://www.hsguru.com/meta', String(unsafe));
  }
  const tierlist = byType((await seoStructuredDataGraph('/tierlist/', { sourceUrl: 'https://www.hsguru.com/meta' }))!['@graph'], 'Dataset')!;
  assert.deepEqual((tierlist.isBasedOn as Array<{ name: string }>).map(source => source.name),
    ['HearthArena: Tierlist', 'HSReplay: Arena cards', 'Firestone'], 'several sources keep their own addresses');
});

test('only an https address on HSGuru is taken for the source of the data', () => {
  assert.equal(hsguruSourceUrl('https://www.hsguru.com/meta?format=1'), 'https://www.hsguru.com/meta?format=1');
  assert.equal(hsguruSourceUrl('https://hsguru.com/meta'), 'https://hsguru.com/meta');
  for (const foreign of ['http://www.hsguru.com/meta', 'https://hsguru.com.evil.example/meta', 'https://evil.example/hsguru.com',
    'https://api.hsguru.com/meta', 'javascript:alert(1)', '/meta', '', null, undefined]) {
    assert.equal(hsguruSourceUrl(foreign), null, String(foreign));
  }
});

test('references to registered pages use their canonical trailing-slash URLs', async () => {
  const graph = (await seoStructuredDataGraph('/classes'))!['@graph'];
  const trail = (byType(graph, 'BreadcrumbList')!.itemListElement as Array<{ item: string }>).map(entry => entry.item);
  assert.deepEqual(trail, ['https://hearthpulse.net/', 'https://hearthpulse.net/classes/']);
  assert.equal(byType(graph, 'BreadcrumbList')!['@id'], 'https://hearthpulse.net/classes/#breadcrumb');
});

test('every structured-data entry belongs to a registered SEO page and builds a graph', async () => {
  for (const [path, nodes] of Object.entries(registry.pages)) {
    assert.ok(seoPageForExactPath(path), `${path} must be listed in config/public-seo-pages.json`);
    const graph = await seoStructuredDataGraph(path);
    const types = nodes.map(node => node['@type']);
    assert.deepEqual(graph?.['@graph'].map(node => node['@type']), ['Organization', ...types], path);
    assert.equal(JSON.stringify(nodes).includes('"breadcrumb":{"@id"'), false, `${path} registry stays unenriched`);
  }
});

const SITE_ORIGIN = 'https://hearthpulse.net';
const REQUIRED_STRINGS: Record<string, string[]> = {
  WebSite: ['name', 'url'], WebPage: ['name', 'description', 'url'], CollectionPage: ['name', 'url'],
  Dataset: ['name', 'description', 'url'], Organization: ['name', 'url'],
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
    const graph = (await seoStructuredDataGraph(path))!;
    assert.equal(graph['@context'], 'https://schema.org');
    for (const node of graph['@graph']) {
      const type = String(node['@type']);
      for (const field of REQUIRED_STRINGS[type] ?? []) {
        assert.equal(typeof node[field], 'string', `${path} ${type} ${field}`);
      }
      const list = REQUIRED_LISTS[type];
      if (list) assert.ok(Array.isArray(node[list]) && (node[list] as unknown[]).length > 0, `${path} ${type} ${list}`);
      if (type === 'Dataset') {
        assert.equal('creator' in node, false, `${path} Dataset creator`);
        assert.equal('license' in node, false, `${path} Dataset license`);
        assert.deepEqual(node.publisher, { '@id': ORGANIZATION_ID }, `${path} Dataset publisher`);
      }
    }
    assertCanonicalReferences(graph, path);
  }
});

const EXPECTED_ORGANIZATION = {
  '@type': 'Organization', '@id': ORGANIZATION_ID, name: 'HearthPulse', url: 'https://hearthpulse.net/',
  logo: { '@type': 'ImageObject', url: 'https://hearthpulse.net/assets/arena_icon.webp' },
  sameAs: ['https://t.me/manacost_ru', 'https://boosty.to/kolodahearthstone'],
  parentOrganization: { '@type': 'Organization', name: 'Manacost', sameAs: ['https://t.me/manacost_ru', 'https://boosty.to/kolodahearthstone'] },
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isRecord = (value: unknown): value is Record<string, Json> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Every object of a document, at any depth. */
function* objectsOf(value: unknown): Generator<Record<string, Json>> {
  if (Array.isArray(value)) { for (const item of value) yield* objectsOf(item); return; }
  if (!isRecord(value)) return;
  yield value;
  for (const child of Object.values(value)) yield* objectsOf(child);
}

/** The organization nodes of a graph, and the proof that every `@id` reference in it is defined in it. */
function assertSelfContained(graph: unknown, label: string): Record<string, Json>[] {
  const all = [...objectsOf(graph)];
  const defined = new Set(all.filter(node => typeof node['@id'] === 'string' && Object.keys(node).length > 1).map(node => node['@id']));
  for (const reference of all.filter(node => typeof node['@id'] === 'string' && Object.keys(node).length === 1)) {
    assert.ok(defined.has(reference['@id']), `${label}: ${String(reference['@id'])} is referenced but defined nowhere in the document`);
  }
  return all.filter(node => node['@type'] === 'Organization' && node['@id'] === ORGANIZATION_ID);
}

test('every registry page prints the one full organization node, the same on every page, and each reference resolves in the page', async () => {
  for (const path of Object.keys(registry.pages)) {
    const graph = (await seoStructuredDataGraph(path))!;
    assert.deepEqual(assertSelfContained(graph, path), [EXPECTED_ORGANIZATION], path);
    const organizations = graph['@graph'].filter(node => node['@type'] === 'Organization');
    assert.equal(organizations.length, 1, `${path} has exactly one organization node`);
  }
});

test('the organization is HearthPulse with Manacost as its parent, and the old brand names are gone', async () => {
  for (const path of Object.keys(registry.pages)) {
    const text = JSON.stringify(await seoStructuredDataGraph(path));
    assert.equal(text.includes('Manacost Arena'), false, `${path} keeps no old application name`);
    const names = [...objectsOf(JSON.parse(text))].filter(node => node.name === 'Manacost');
    assert.deepEqual(names.map(node => node['@type']), ['Organization'], `${path}: Manacost appears once, as an organization`);
  }
  const node = organizationNode();
  node.name = 'changed';
  assert.equal(organizationNode().name, 'HearthPulse', 'a caller cannot change the shared node');
});

test('no registry graph offers a price or claims to be an application, and no dataset names a creator or a licence', async () => {
  for (const path of Object.keys(registry.pages)) {
    for (const node of objectsOf(await seoStructuredDataGraph(path, { dateModified: UPDATED_AT }))) {
      assert.notEqual(node['@type'], 'Offer', `${path} has no price`);
      assert.notEqual(node['@type'], 'WebApplication', `${path} is no application`);
      assert.equal('offers' in node, false, `${path} offers nothing`);
      if (node['@type'] === 'Dataset') {
        assert.equal('creator' in node, false, `${path} Dataset creator`);
        assert.equal('license' in node, false, `${path} Dataset license`);
      }
    }
    for (const node of (await seoStructuredDataGraph(path))!['@graph'].filter(entry => entry['@type'] === 'Dataset')) {
      assert.deepEqual(node.publisher, { '@id': ORGANIZATION_ID }, `${path} Dataset publisher`);
    }
  }
  const home = byType((await seoStructuredDataGraph('/'))!['@graph'], 'WebPage')!;
  assert.equal(typeof home.name, 'string');
  assert.equal(typeof home.description, 'string');
  assert.equal(home.url, 'https://hearthpulse.net/');
  assert.deepEqual(home.breadcrumb, { '@id': 'https://hearthpulse.net/#breadcrumb' });
  assert.equal('isPartOf' in home, true);
});

const ORIGIN = 'https://hearthpulse.net';

test('entity, listing, cosmetic and guide pages print the same organization node, and every reference resolves in the page', () => {
  const crumbs = (name: string, item: string) => [{ name: 'Главная', item: `${ORIGIN}/` }, { name, item }];
  const card = buildEntityStructuredData({
    canonical: `${ORIGIN}/standard/cards/standard/CARD_1/`, title: 'Карта', description: 'Описание', origin: ORIGIN, image: null,
    entityFragment: 'card', entity: { name: 'Карта' }, breadcrumbs: crumbs('Карта', `${ORIGIN}/standard/cards/standard/CARD_1/`),
  });
  const listing = buildCollectionStructuredData({
    canonical: `${ORIGIN}/standard/cards/`, origin: ORIGIN, name: 'Карты Hearthstone',
    mainEntity: { '@type': 'ItemList', numberOfItems: 0, itemListElement: [] }, breadcrumbs: crumbs('Карты', `${ORIGIN}/standard/cards/`),
  });
  const cosmetic = buildCosmeticStructuredData({
    origin: ORIGIN, kind: 'heroes', cardId: 'HERO_01cb', dbf: 71, name: 'Утер', englishName: 'Uther', description: 'Скин героя.', image: `${ORIGIN}/a.png`,
  });
  const guide = buildGuideStructuredData({
    slug: 'Breakfast-priest', title: 'Гайд', description: 'Описание', image: null, publishedAt: '2017-12-02', updatedAt: null, hasPaid: true,
  } as never, '/share/articles.png');
  for (const [label, graph] of Object.entries({ card, listing, cosmetic, guide })) {
    assert.deepEqual(assertSelfContained(graph, label), [EXPECTED_ORGANIZATION], label);
    assert.equal((graph['@graph'] as Array<Record<string, unknown>>).filter(node => node['@type'] === 'Organization').length, 1, label);
  }
  // The paid markup of a guide stays as it was: the block marked closed, no creator, the brand as author.
  const article = byType(guide['@graph'], 'Article')!;
  assert.deepEqual(article.hasPart, [{ '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.guide-archive-paid' }]);
  assert.equal(article.isAccessibleForFree, false);
  assert.deepEqual(article.author, { '@id': ORGANIZATION_ID });
  assert.deepEqual(article.publisher, { '@id': ORGANIZATION_ID });
});

test('a cosmetic page is a graph of page, item, breadcrumb and organization, with no person as creator', () => {
  const graph = buildCosmeticStructuredData({
    origin: ORIGIN, kind: 'coins', cardId: 'AT_COIN', dbf: 2, name: 'Gallant Coin', englishName: null,
    description: 'Косметическая монета Hearthstone «Gallant Coin».', image: null,
  });
  const nodes = graph['@graph'] as Array<Record<string, unknown>>;
  assert.deepEqual(nodes.map(node => node['@type']), ['WebPage', 'CreativeWork', 'BreadcrumbList', 'Organization']);
  const [page, work, trail] = nodes;
  const url = `${ORIGIN}/cosmetics/coins/AT_COIN/`;
  assert.equal(page.url, url);
  assert.deepEqual(page.mainEntity, { '@id': work['@id'] });
  assert.deepEqual(page.breadcrumb, { '@id': trail['@id'] });
  assert.equal(work.name, 'Gallant Coin');
  assert.equal(work.description, 'Косметическая монета Hearthstone «Gallant Coin».');
  assert.deepEqual(work.identifier, [
    { '@type': 'PropertyValue', propertyID: 'card_id', value: 'AT_COIN' },
    { '@type': 'PropertyValue', propertyID: 'dbf', value: 2 },
  ]);
  for (const node of objectsOf(graph)) {
    assert.notEqual(node['@type'], 'Person');
    assert.equal('creator' in node, false);
  }
  const steps = trail.itemListElement as Array<Record<string, unknown>>;
  assert.deepEqual(steps.map(step => step.position), [1, 2, 3, 4]);
  assert.deepEqual(steps.map(step => step.item), [`${ORIGIN}/`, `${ORIGIN}/cosmetics/`, `${ORIGIN}/cosmetics/coins/`, url]);
  assert.equal(steps.at(-1)!.item, page.url, 'the last step is the canonical address of the page');
  assert.deepEqual(steps.map(step => step.name), ['Главная', 'Косметика', 'Косметические монеты', 'Gallant Coin']);
});

test('only a page node links a breadcrumb: a dataset or a list has no such property, and a cosmetics listing has a trail', async () => {
  const PAGE_TYPES = ['WebPage', 'CollectionPage', 'ItemPage'];
  for (const path of Object.keys(registry.pages)) {
    for (const node of (await seoStructuredDataGraph(path, { items: [{ name: 'Х', url: 'https://hearthpulse.net/cosmetics/heroes/H/' }] }))!['@graph']) {
      if ('breadcrumb' in node) assert.ok(PAGE_TYPES.includes(String(node['@type'])), `${path} ${String(node['@type'])} has no breadcrumb property`);
    }
  }
  const archetype = (await seoStructuredDataGraphOf('/standard/archetypes/standard/pure-paladin/', [
    { '@type': 'ItemPage', url: 'https://hearthpulse.net/standard/archetypes/standard/pure-paladin/' },
    { '@type': 'Dataset', name: 'Д', description: 'Д', url: 'https://hearthpulse.net/standard/archetypes/standard/pure-paladin/' },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'А', item: 'https://hearthpulse.net/standard/archetypes/' }] },
  ]))!['@graph'];
  assert.ok('breadcrumb' in byType(archetype, 'ItemPage')!);
  assert.equal('breadcrumb' in byType(archetype, 'Dataset')!, false);
  for (const [kind, section] of [['heroes', 'Скины героев'], ['coins', 'Косметические монеты'], ['pets', 'Питомцы']]) {
    const graph = (await seoStructuredDataGraph(`/cosmetics/${kind}/`))!['@graph'];
    const trail = byType(graph, 'BreadcrumbList')!;
    assert.deepEqual((trail.itemListElement as Array<Record<string, unknown>>).map(step => [step.position, step.name, step.item]), [
      [1, 'Главная', 'https://hearthpulse.net/'], [2, 'Косметика', 'https://hearthpulse.net/cosmetics/'],
      [3, section, `https://hearthpulse.net/cosmetics/${kind}/`],
    ]);
    assert.deepEqual(byType(graph, 'CollectionPage')!.breadcrumb, { '@id': trail['@id'] });
  }
});

test('a page that is not indexable prints no graph at all, organization included', async () => {
  assert.equal(await seoStructuredDataGraph('/standard/deck-builder/'), null);
  assert.equal(await seoStructuredDataGraph('/articles/'), null);
});

test('a list page names the entries it prints, at most 100, each once, only on its own site', async () => {
  const entry = (index: number) => ({ name: `Карта ${index}`, url: `https://hearthpulse.net/cosmetics/heroes/HERO_${index}/` });
  const items = [...Array.from({ length: 130 }, (_, index) => entry(index + 1)),
    entry(1), { name: 'Чужая', url: 'https://example.com/x/' }, { name: ' ', url: 'https://hearthpulse.net/a/' }, { name: 'Битая', url: 'nope' }];
  const graph = (await seoStructuredDataGraph('/cosmetics/', { items }))!['@graph'];
  const list = byType(graph, 'ItemList')!;
  const entries = list.itemListElement as Array<Record<string, unknown>>;
  assert.equal(entries.length, 100);
  assert.equal(list.numberOfItems, 100, 'the count is of the entries named');
  assert.deepEqual(entries.map(item => item.position), entries.map((_, index) => index + 1));
  assert.deepEqual(entries[0], { '@type': 'ListItem', position: 1, name: 'Карта 1', url: 'https://hearthpulse.net/cosmetics/heroes/HERO_1/' });
  assert.deepEqual(byType(graph, 'CollectionPage')!.mainEntity, { '@id': list['@id'] }, 'the collection is the list');
  assertSelfContained({ '@graph': graph }, '/cosmetics/');

  const short = byType((await seoStructuredDataGraph('/cosmetics/', { items: [entry(1), entry(2)] }))!['@graph'], 'ItemList')!;
  assert.equal(short.numberOfItems, 2);
  for (const none of [undefined, [], [{ name: 'Чужая', url: 'https://example.com/x/' }]]) {
    assert.equal(byType((await seoStructuredDataGraph('/cosmetics/', { items: none }))!['@graph'], 'ItemList'), undefined);
  }
  // A page that is no collection takes no list, and a list that is already a page's own is kept.
  assert.equal(byType((await seoStructuredDataGraph('/classes/', { items: [entry(1)] }))!['@graph'], 'ItemList'), undefined);
});

test('every dataset names where its data comes from and which metrics it measures, without values', async () => {
  const sources: Record<string, string[]> = {
    '/standard/matchups': ['https://www.hsguru.com/matchups'],
    '/standard/meta': ['https://www.hsguru.com/meta'],
    '/standard/archetypes': ['https://www.hsguru.com/meta'],
    '/standard/archetypes/wild': ['https://www.hsguru.com/meta'],
    '/classes': ['https://hsreplay.net/arena/', 'https://www.firestoneapp.com/'],
    '/tierlist': ['https://www.heartharena.com/ru/tierlist', 'https://hsreplay.net/arena/cards/', 'https://www.firestoneapp.com/'],
  };
  const metrics: Record<string, string[]> = {
    '/standard/matchups': ['Винрейт в матчапе', 'Число игр'],
    '/standard/meta': ['Винрейт', 'Популярность', 'Число игр'],
    '/standard/archetypes': ['Винрейт', 'Популярность', 'Число игр'],
    '/standard/archetypes/wild': ['Винрейт', 'Популярность', 'Число игр'],
    '/classes': ['Винрейт класса'],
    '/tierlist': ['Оценка карты', 'Винрейт карты', 'Частота выбора карты'],
  };
  for (const path of Object.keys(sources)) {
    const dataset = byType((await seoStructuredDataGraph(path))!['@graph'], 'Dataset')!;
    const origins = [dataset.isBasedOn].flat() as Array<Record<string, string>>;
    assert.deepEqual(origins.map(origin => origin.url), sources[path], `${path} sources`);
    for (const origin of origins) assert.deepEqual(Object.keys(origin).sort(), ['@type', 'name', 'url'], `${path} source node`);
    const measured = dataset.variableMeasured as Array<Record<string, unknown>>;
    assert.deepEqual(measured.map(variable => variable.name), metrics[path], `${path} metrics`);
    for (const variable of measured) {
      assert.equal(variable['@type'], 'PropertyValue');
      assert.equal('value' in variable, false, `${path} ${variable.name} carries a name, not a number`);
    }
  }
});

test('no graph carries a window, a made-up property, a placeholder, a hard-coded size or a deck code', async () => {
  for (const path of Object.keys(registry.pages)) {
    for (const facts of [{}, { dateModified: UPDATED_AT, sourceUrl: 'https://www.hsguru.com/meta' }]) {
      const json = JSON.stringify(await seoStructuredDataGraph(path, facts));
      for (const forbidden of ['temporalCoverage', 'P7D', 'gameMode', '{{', 'numberOfItems', 'deckCode']) {
        assert.equal(json.includes(forbidden), false, `${path} must not contain ${forbidden}`);
      }
      assert.doesNotMatch(json, /AAE[A-Za-z0-9+/]{20,}/, `${path} must not contain a deck code`);
    }
  }
});

test('the contents lists of the tier lists are gone, and no description counts the classes', async () => {
  const types = async (path: string) => (await seoStructuredDataGraph(path))!['@graph'].map(node => node['@type']);
  assert.deepEqual(await types('/tierlist/'), ['Organization', 'BreadcrumbList', 'Dataset']);
  assert.deepEqual(await types('/legendaries/'), ['Organization', 'BreadcrumbList', 'Dataset']);
  assert.deepEqual(await types('/battlegrounds/tier-list/'), ['Organization', 'BreadcrumbList', 'CollectionPage', 'Dataset']);
  const classes = byType((await seoStructuredDataGraph('/classes/'))!['@graph'], 'Dataset')!;
  assert.equal(classes.description, 'Процент побед (винрейт) классов в режиме Арена Hearthstone по данным HSReplay и Firestone. '
    + 'Разбивки, история и сравнение классов доступны по подписке; на открытой странице — порядок классов с винрейтом до десятых долей процента, '
    + 'размер выборки по классу, дата обновления и источник.');
});

test('lists describe what the page shows: true counts, distinct targets', async () => {
  for (const path of Object.keys(registry.pages)) {
    for (const node of (await seoStructuredDataGraph(path))!['@graph']) {
      if (node['@type'] !== 'ItemList' && node['@type'] !== 'BreadcrumbList') continue;
      const items = node.itemListElement as Array<Record<string, unknown>>;
      if (node.numberOfItems !== undefined) assert.equal(node.numberOfItems, items.length, `${path} numberOfItems`);
      assert.deepEqual(items.map(item => item.position), items.map((_, index) => index + 1), `${path} positions`);
      const targets = items.map(item => item.item ?? item.url).filter(Boolean);
      assert.equal(new Set(targets).size, targets.length, `${path} ${node['@type']} repeats a URL`);
    }
  }
});

test('an entity page names its primary image only when it has a picture', () => {
  const options = {
    canonical: 'https://hearthpulse.net/standard/cards/standard/CARD_1/', title: 'Карта', description: 'Описание',
    origin: 'https://hearthpulse.net', entityFragment: 'card' as const, entity: { name: 'Карта' },
    breadcrumbs: [{ name: 'Главная', item: 'https://hearthpulse.net/' }, { name: 'Карта', item: 'https://hearthpulse.net/standard/cards/standard/CARD_1/' }],
  };
  const bare = buildEntityStructuredData({ ...options, image: null })['@graph'] as Array<Record<string, unknown>>;
  assert.equal('primaryImageOfPage' in bare[0], false);
  const pictured = buildEntityStructuredData({ ...options, image: 'https://hearthpulse.net/card.png' })['@graph'] as Array<Record<string, unknown>>;
  assert.deepEqual(pictured[0].primaryImageOfPage, { '@type': 'ImageObject', contentUrl: 'https://hearthpulse.net/card.png' });
});

test('pages without an entry, and the source registry itself, are left alone', async () => {
  assert.equal(await seoStructuredDataGraph('/standard/cards'), null);
  assert.equal(await seoStructuredDataGraph('/no-such-page'), null);
  await seoStructuredDataGraph('/classes');
  const dataset = registry.pages['/classes'].find(node => node['@type'] === 'Dataset')!;
  assert.equal(dataset.dateModified, undefined, 'building a graph must not mutate the registry');
});

// ── Closed Arena pages (E22 D1: the page text is gone, the dataset stays) ──

test('a closed Arena dataset says it is for subscribers and describes no removed explanation text', async () => {
  for (const [path, sources] of [
    ['/classes', ['HSReplay', 'Firestone']],
    ['/tierlist', ['HSReplay', 'HearthArena', 'Firestone']],
    ['/legendaries', ['HSReplay', 'Firestone']],
  ] as const) {
    const graph = (await seoStructuredDataGraph(path))!['@graph'];
    const dataset = byType(graph, 'Dataset')!;
    assert.equal(dataset.isAccessibleForFree, false, `${path} is not free`);
    for (const source of sources) assert.ok(String(dataset.description).includes(source), `${path} dataset names ${source}`);
    assert.doesNotMatch(String(dataset.description), /\d|%|миллион|тысяч|каждые\s+\S+\s+час|раз\s+в\s+(?:сутки|день|час)/i, `${path} dataset states no figure or update frequency`);
    assert.equal(byType(graph, 'FAQPage'), undefined, `${path} has no FAQ markup`);
  }
  const classes = byType((await seoStructuredDataGraph('/classes'))!['@graph'], 'Dataset')!;
  assert.doesNotMatch(String(classes.description), /как читать рейтинг/, '/classes does not describe the removed reading guide');
});
