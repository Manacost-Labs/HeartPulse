import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { seoPageForExactPath } from '../src/seo/registry';
import { parseSeoPageCopy, seoCopyPieces, seoPageCopy } from '../src/seo/pageCopy';
import { seoStructuredDataGraph } from '../src/seo/structuredData';
import { buildEntityStructuredData } from '../shared/entitySeoStructuredData';
import { normalizePublicPathname } from '../src/shared/seo/publicUrlPolicy';
import { hsguruSourceUrl } from '../apps/public-web/lib/seoDataSource';

const registry = JSON.parse(readFileSync('config/public-seo-structured-data.json', 'utf8')) as {
  pages: Record<string, Array<Record<string, unknown>>>;
};
const UPDATED_AT = '2026-10-28T23:00:04Z';
const ORGANIZATION_ID = 'https://hearthpulse.net/#org';
const byType = (graph: Array<Record<string, unknown>>, type: string) => graph.find(node => node['@type'] === type);

test('the home graph links its application to the breadcrumb and marks the language', async () => {
  const graph = (await seoStructuredDataGraph('/'))!['@graph'];
  assert.deepEqual(graph.map(node => node['@type']), ['WebSite', 'WebApplication', 'BreadcrumbList']);
  assert.equal(byType(graph, 'BreadcrumbList')!['@id'], 'https://hearthpulse.net/#breadcrumb');
  assert.deepEqual(byType(graph, 'WebApplication')!.breadcrumb, { '@id': 'https://hearthpulse.net/#breadcrumb' });
  assert.equal(byType(graph, 'FAQPage'), undefined, 'FAQ belongs on the dedicated help page');
  assert.equal(byType(graph, 'WebSite')!.breadcrumb, undefined, 'the site node is not a page in the trail');
});

test('a dataset is dated by its data, never by the clock of the server', async () => {
  const dataset = byType((await seoStructuredDataGraph('/standard/archetypes/', { dateModified: UPDATED_AT }))!['@graph'], 'Dataset')!;
  assert.equal(dataset.dateModified, '2026-10-28T23:00:04.000Z', 'the full instant the source gave');
  assert.equal(dataset.license, 'https://hearthpulse.net/terms/', 'the license is the site terms, not an invented one');
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
    const expected = types.includes('Dataset') ? ['Organization', ...types] : types;
    assert.deepEqual(graph?.['@graph'].map(node => node['@type']), expected, path);
    assert.equal(JSON.stringify(nodes).includes('"breadcrumb":{"@id"'), false, `${path} registry stays unenriched`);
  }
});

const SITE_ORIGIN = 'https://hearthpulse.net';
const REQUIRED_STRINGS: Record<string, string[]> = {
  WebSite: ['name', 'url'], WebApplication: ['name', 'url'], CollectionPage: ['name', 'url'],
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
        assert.deepEqual(node.creator, { '@id': ORGANIZATION_ID }, `${path} Dataset creator`);
        assert.deepEqual(node.publisher, { '@id': ORGANIZATION_ID }, `${path} Dataset publisher`);
      }
    }
    assertCanonicalReferences(graph, path);
  }
});

test('a page with a dataset defines the organization its creator and publisher point at', async () => {
  const withDataset = Object.entries(registry.pages).filter(([, nodes]) => nodes.some(node => node['@type'] === 'Dataset'));
  assert.deepEqual(withDataset.map(([path]) => path),
    ['/standard/matchups', '/standard/meta', '/standard/archetypes', '/standard/vicious-gold', '/classes', '/tierlist']);
  for (const [path] of Object.entries(registry.pages)) {
    const graph = (await seoStructuredDataGraph(path))!['@graph'];
    const organizations = graph.filter(node => node['@type'] === 'Organization' && node['@id'] === ORGANIZATION_ID);
    if (!withDataset.some(([datasetPath]) => datasetPath === path)) {
      assert.equal(graph.some(node => node['@type'] === 'Dataset'), false, path);
      assert.equal(organizations.length, 0, `${path} has no dataset to publish`);
      continue;
    }
    assert.deepEqual(organizations, [{
      '@type': 'Organization', '@id': ORGANIZATION_ID, name: 'Manacost', url: 'https://hearthpulse.net/',
      logo: { '@type': 'ImageObject', url: 'https://hearthpulse.net/assets/arena_icon.webp' },
    }], path);
  }
});

test('every dataset names where its data comes from and which metrics it measures, without values', async () => {
  const sources: Record<string, string[]> = {
    '/standard/matchups': ['https://www.hsguru.com/matchups'],
    '/standard/meta': ['https://www.hsguru.com/meta'],
    '/standard/archetypes': ['https://www.hsguru.com/meta'],
    '/standard/vicious-gold': ['https://www.vicioussyndicate.com/data-reaper-live/'],
    '/classes': ['https://hsreplay.net/arena/', 'https://www.firestoneapp.com/'],
    '/tierlist': ['https://www.heartharena.com/ru/tierlist', 'https://hsreplay.net/arena/cards/', 'https://www.firestoneapp.com/'],
  };
  const metrics: Record<string, string[]> = {
    '/standard/matchups': ['Винрейт в матчапе', 'Число игр'],
    '/standard/meta': ['Винрейт', 'Популярность', 'Число игр'],
    '/standard/archetypes': ['Винрейт', 'Популярность', 'Число игр'],
    '/standard/vicious-gold': ['Винрейт колоды', 'Частота колоды', 'Частота класса', 'Power Tier'],
    '/classes': ['Винрейт класса'],
    '/tierlist': ['Оценка карты'],
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
  assert.deepEqual(await types('/legendaries/'), ['BreadcrumbList']);
  assert.deepEqual(await types('/battlegrounds/tier-list/'), ['BreadcrumbList', 'CollectionPage']);
  const classes = byType((await seoStructuredDataGraph('/classes/'))!['@graph'], 'Dataset')!;
  assert.equal(classes.description, 'Процент побед (винрейт) классов в режиме Арена Hearthstone по данным HSReplay и Firestone, обновление каждые 6 часов. '
    + 'Значения доступны по подписке; на открытой странице — описание того, как читать рейтинг, откуда берутся данные и как часто они обновляются.');
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

// ── Text of the closed Arena pages (E9 S4a) ──

const pageCopyText = (path: string) => seoPageCopy(path)!.sections.flatMap(section => [section.question, ...section.body.flat()]).join('\n');

test('a closed Arena dataset says it is for subscribers and names only what the page text explains', async () => {
  for (const [path, sources, phrases] of [
    ['/classes', ['HSReplay', 'Firestone'], ['винрейт', 'каждые 6 часов', 'по подписке']],
    ['/tierlist', ['HSReplay', 'HearthArena', 'Firestone'], ['от S до F', 'каждые 6 часов', 'по подписке']],
  ] as const) {
    const dataset = byType((await seoStructuredDataGraph(path))!['@graph'], 'Dataset')!;
    assert.equal(dataset.isAccessibleForFree, false, `${path} is not free`);
    const text = pageCopyText(path);
    for (const source of sources) {
      assert.ok(String(dataset.description).includes(source), `${path} dataset names ${source}`);
      assert.ok(text.includes(source), `${path} text names ${source}`);
    }
    for (const phrase of phrases) assert.ok(text.includes(phrase), `${path} text says «${phrase}»`);
    assert.doesNotMatch(String(dataset.description), /\d+\s*(?:%|тыс|млн|миллион)/, `${path} dataset states no figures`);
  }
});

test('page copy splits a paragraph into text and links', () => {
  assert.deepEqual(seoCopyPieces('Смотрите [рейтинг классов](/classes/) и [FAQ](/faq/).'), [
    { text: 'Смотрите ' }, { text: 'рейтинг классов', href: '/classes/' }, { text: ' и ' }, { text: 'FAQ', href: '/faq/' }, { text: '.' },
  ]);
  assert.deepEqual(seoCopyPieces('Без ссылок'), [{ text: 'Без ссылок' }]);
});

test('page copy is accepted only for a registry page, with question headings and links to registry pages', () => {
  const page = (section: unknown, path = '/classes') => ({ schemaVersion: 1, pages: { [path]: { sections: [section] } } });
  const section = { question: 'Какой класс выбрать?', body: ['Текст.', ['Один', 'Два']] };
  assert.deepEqual(parseSeoPageCopy(page(section))['/classes'].sections, [section]);
  assert.deepEqual(parseSeoPageCopy({ schemaVersion: 1, pages: {} }), {});
  const rejected: Array<[string, unknown]> = [
    ['an unknown page', page(section, '/no-such-page')],
    ['a heading that is no question', page({ ...section, question: 'Классы Арены' })],
    ['a blank heading', page({ ...section, question: ' ' })],
    ['a section without a body', page({ ...section, body: [] })],
    ['an empty paragraph', page({ ...section, body: [' '] })],
    ['an empty list', page({ ...section, body: [[]] })],
    ['a blank list item', page({ ...section, body: [['Один', '']] })],
    ['a link to an unknown page', page({ ...section, body: ['См. [раздел](/no-such-page/).'] })],
    ['a link without the trailing slash', page({ ...section, body: ['См. [классы](/classes).'] })],
    ['an unsupported version', { schemaVersion: 2, pages: {} }],
    ['no pages', { schemaVersion: 1 }],
  ];
  for (const [name, raw] of rejected) assert.throws(() => parseSeoPageCopy(raw), /SEO page copy|Unsupported/, name);
});
