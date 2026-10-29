import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { CONTROL_WARRIOR_DECK_CODE, metaExternalRoutes } from './helpers/browserMetaFixture.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Large image, full snippet and video previews, as the shared URL policy
// (`src/shared/seo/robots.ts`) grants every indexable page.
const INDEXABLE_ROBOTS = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/>';

// Pages built with apps/public-web/lib/seoPageMetadata.ts, rendered by Next.
async function head(origin, path) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  assert.equal(response.status, 200, path);
  return (await response.text()).match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
}

const YEAR = String(new Date().getUTCFullYear());
const REGISTRY_PAGES = Object.entries(JSON.parse(readFileSync('config/public-seo-pages.json', 'utf8')).pages)
  .map(([path, page]) => ({
    path, url: path === '/' ? '/' : `${path}/`, sitemap: page.sitemap,
    title: page.title.replaceAll('{year}', YEAR), description: page.description.replaceAll('{year}', YEAR),
  }));

// React escapes text and attribute values in server HTML.
function decoded(value) {
  return value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/** Text a reader gets without JavaScript: no tags and no script or style contents. */
function visibleText(html) {
  const lower = html.toLowerCase();
  let text = '';
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf('<', index);
    if (open === -1) { text += html.slice(index); break; }
    text += html.slice(index, open);
    const close = html.indexOf('>', open);
    if (close === -1) break;
    index = close + 1;
    const name = lower.slice(open + 1, close).split(/[\s/]/, 1)[0];
    if (name === 'script' || name === 'style') {
      const end = lower.indexOf(`</${name}`, index);
      index = end === -1 ? html.length : html.indexOf('>', end) + 1;
    }
  }
  return decoded(text);
}

function assertOnce(html, pattern, expected, label) {
  assert.deepEqual([...html.matchAll(pattern)].map(match => decoded(match[1])), [expected], label);
}

function jsonLdGraph(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map(match => JSON.parse(match[1]))
    .find(data => Array.isArray(data['@graph']));
}

test('registry pages render canonical, robots, share metadata and JSON-LD from the SEO registries', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    const legendaries = await head(runtime.nextOrigin, '/legendaries/');
    assert.match(legendaries, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/legendaries\/"\/>/);
    assert.ok(legendaries.includes(INDEXABLE_ROBOTS), 'registry pages keep the preview directives');
    assert.match(legendaries, /<meta property="og:url" content="https:\/\/hearthpulse\.net\/legendaries\/"\/>/);
    assert.match(legendaries, /<meta property="og:image:alt" content="HearthPulse — легендарки Арены"\/>/);
    assert.match(legendaries, /<meta name="twitter:card" content="summary_large_image"\/>/);
    // Arena pages share the Arena preview; the version query makes messengers refetch a re-render.
    const arenaImage = 'https:\\/\\/hearthpulse\\.net\\/assets\\/og\\/hearthpulse-arena\\.png\\?v=\\d{8}';
    assert.match(legendaries, new RegExp(`<meta property="og:image" content="${arenaImage}"/>`));
    assert.match(legendaries, /<meta property="og:image:width" content="1200"\/>/);
    assert.match(legendaries, /<meta property="og:image:height" content="630"\/>/);
    assert.match(legendaries, new RegExp(`<meta name="twitter:image" content="${arenaImage}"/>`));

    const home = await head(runtime.nextOrigin, '/');
    assert.match(home, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/"\/>/);
    assert.match(home, /<meta property="og:image" content="https:\/\/hearthpulse\.net\/assets\/og\/hearthpulse-default\.png\?v=\d{8}"\/>/);

    for (const path of ['/faq/', '/developers/api/', '/gallery/', '/standard/cards/standard/',
      '/standard/cards/standard/CARD_QA_0002/', '/library/', '/cosmetics/']) {
      assert.ok((await head(runtime.nextOrigin, path)).includes(INDEXABLE_ROBOTS), `${path} robots`);
    }

    // Every entry of the structured-data registry must reach its page.
    const structuredData = JSON.parse(readFileSync('config/public-seo-structured-data.json', 'utf8')).pages;
    for (const [path, nodes] of Object.entries(structuredData)) {
      const response = await fetch(`${runtime.nextOrigin}${path === '/' ? '/' : `${path}/`}`);
      assert.equal(response.status, 200, path);
      const types = nodes.map(node => node['@type']);
      assert.deepEqual(jsonLdGraph(await response.text())?.['@graph'].map(node => node['@type']),
        types.includes('Dataset') ? ['Organization', ...types] : types, `${path} JSON-LD`);
    }

    // /articles/ is prerendered, so every query gets the same HTML with the
    // canonical page; Nginx marks the paginated URL noindex (nginx-html-routing test).
    const filtered = await head(runtime.nextOrigin, '/articles/?page=2');
    assert.match(filtered, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/articles\/"\/>/);
  } finally {
    await runtime.close();
  }
});

/** The graph of the single entity JSON-LD script a Next detail or listing page renders for its path. */
function entityGraph(html, path) {
  const scripts = [...html.matchAll(/<script\b(?=[^>]*type="application\/ld\+json")(?=[^>]*data-server-entity-jsonld)([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, `${path} must render exactly one entity JSON-LD script`);
  assert.match(scripts[0][1], new RegExp(`data-entity-path="${path}"`), `${path} JSON-LD is scoped to its path`);
  const document = JSON.parse(scripts[0][2]);
  assert.equal(document['@context'], 'https://schema.org');
  return document['@graph'];
}

const crumbs = breadcrumb => breadcrumb.itemListElement.map(({ '@type': type, position, name, item }) => ({ type, position, name, item }));

test('a card page describes the card, its site and its path in one JSON-LD graph', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    for (const [format, formatName, formatLabel, crumbName] of [['standard', 'Стандарт', 'Стандарте', 'Стандарт'], ['wild', 'Вольный формат', 'Вольном формате', 'Вольный']]) {
      const path = `/standard/cards/${format}/CARD_QA_0002/`;
      const canonical = `https://hearthpulse.net${path}`;
      const response = await fetch(`${runtime.nextOrigin}${path}`);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      const graph = entityGraph(html, path.slice(0, -1));
      assert.deepEqual(graph.map(node => node['@type']), ['WebPage', 'CreativeWork', 'BreadcrumbList'], `${format} graph`);
      const [page, card, breadcrumb] = graph;

      assert.deepEqual(page, {
        '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical,
        name: `Публичная карта 2 — карта Hearthstone (${formatName}, CARD_QA_0002) | HearthPulse`,
        description: `Публичная карта 2: Боевой клич: возьмите карту. Статистика и колоды с картой в ${formatLabel} на HearthPulse.`,
        inLanguage: 'ru',
        isPartOf: { '@type': 'WebSite', '@id': 'https://hearthpulse.net/#website', name: 'HearthPulse', url: 'https://hearthpulse.net/' },
        primaryImageOfPage: { '@type': 'ImageObject', contentUrl: 'https://hearthpulse.net/arena-logo-icon.webp' },
        mainEntity: { '@id': `${canonical}#card` },
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      }, `${format} WebPage`);
      assert.deepEqual(card, {
        '@type': 'CreativeWork', '@id': `${canonical}#card`, url: canonical,
        name: 'Публичная карта 2', alternateName: 'Public Card 2', identifier: 'CARD_QA_0002',
        image: 'https://hearthpulse.net/arena-logo-icon.webp',
        description: `Публичная карта 2: Боевой клич: возьмите карту. Статистика и колоды с картой в ${formatLabel} на HearthPulse.`,
        inLanguage: 'ru', isPartOf: { '@type': 'VideoGame', name: 'Hearthstone' },
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'Формат', value: formatName },
          { '@type': 'PropertyValue', name: 'Мана', value: 2 },
          { '@type': 'PropertyValue', name: 'Тип', value: 'Существо' },
          { '@type': 'PropertyValue', name: 'Редкость', value: 'Обычная' },
          { '@type': 'PropertyValue', name: 'Дополнение', value: 'Основной набор' },
          { '@type': 'PropertyValue', name: 'Атака', value: 2 },
          { '@type': 'PropertyValue', name: 'Здоровье', value: 3 },
        ],
      }, `${format} CreativeWork`);
      assert.equal(breadcrumb['@id'], `${canonical}#breadcrumb`);
      const listing = `https://hearthpulse.net/standard/cards/${format}/`;
      assert.deepEqual(crumbs(breadcrumb), [
        { type: 'ListItem', position: 1, name: 'Карты', item: listing },
        { type: 'ListItem', position: 2, name: crumbName, item: listing },
        { type: 'ListItem', position: 3, name: 'Публичная карта 2', item: canonical },
      ], `${format} breadcrumbs`);

      // The trail is the one the page shows: the same words in the same order, and the same link where the page has one.
      const visible = html.match(/<nav\b[^>]*aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
      assert.ok(visible, `${format} card page shows its breadcrumb`);
      const shown = [...visible.matchAll(/<(a|span|strong)\b([^>]*)>([^<]*)<\/\1>/g)]
        .filter(([, tag,, text]) => !(tag === 'span' && text === '/'))
        .map(([, tag, attributes, text]) => ({ name: decoded(text), href: tag === 'a' ? attributes.match(/href="([^"]*)"/)[1] : null }));
      assert.deepEqual(crumbs(breadcrumb).map(crumb => crumb.name), shown.map(crumb => crumb.name), `${format} names`);
      assert.ok(shown[0].href, `${format} the first visible step links to the listing`);
      assert.equal(crumbs(breadcrumb)[0].item, new URL(shown[0].href, 'https://hearthpulse.net').href, `${format} link`);
    }
  } finally {
    await runtime.close();
  }
});

test('a card library listing shows its path above the same list of cards', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    const home = { name: 'Главная', item: 'https://hearthpulse.net/' };
    const library = { name: 'Карты', item: 'https://hearthpulse.net/standard/cards/' };
    const listings = [
      // The library root lists the Standard cards under its own canonical URL and has no format step.
      ['/standard/cards/', [home, library], 'https://hearthpulse.net/standard/cards/standard/blizzard%3A12345/'],
      ['/standard/cards/standard/', [home, library, { name: 'Стандарт', item: 'https://hearthpulse.net/standard/cards/standard/' }],
        'https://hearthpulse.net/standard/cards/standard/blizzard%3A12345/'],
      ['/standard/cards/wild/', [home, library, { name: 'Вольный', item: 'https://hearthpulse.net/standard/cards/wild/' }],
        'https://hearthpulse.net/standard/cards/wild/blizzard%3A12345/'],
    ];
    for (const [path, trail, firstCard] of listings) {
      const canonical = `https://hearthpulse.net${path}`;
      const response = await fetch(`${runtime.nextOrigin}${path}`);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      const graph = entityGraph(html, path);
      assert.deepEqual(graph.map(node => node['@type']), ['CollectionPage', 'BreadcrumbList'], `${path} graph`);
      const { mainEntity: list, ...collection } = graph[0];
      assert.deepEqual(collection, {
        '@type': 'CollectionPage', '@id': `${canonical}#collection`, url: canonical, name: 'Карты Hearthstone',
        inLanguage: 'ru',
        isPartOf: { '@type': 'WebSite', '@id': 'https://hearthpulse.net/#website', name: 'HearthPulse', url: 'https://hearthpulse.net/' },
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      }, `${path} CollectionPage`);
      assert.equal(graph[1]['@id'], `${canonical}#breadcrumb`, `${path} breadcrumb id`);
      assert.deepEqual(crumbs(graph[1]), trail.map((crumb, index) => ({ type: 'ListItem', position: index + 1, ...crumb })), `${path} breadcrumbs`);

      // The page shows no breadcrumb: its steps are named with the words it does show.
      assert.match(html, /<a\b[^>]*href="\/"[^>]*>Главная<\/a>/, `${path} shows the home link`);
      assert.equal(html.match(/<h1\b[^>]*>([^<]*)<\/h1>/)?.[1], trail[1].name, `${path} heading`);
      if (trail.length === 3) {
        assert.equal(html.match(/<button\b[^>]*aria-label="([^"]*)"[^>]*aria-pressed="true"/)?.[1], trail[2].name, `${path} format switch`);
      }

      assert.equal(list['@type'], 'ItemList');
      assert.equal(list.numberOfItems, 3000, `${path} counts the whole catalog`);
      assert.equal(list.itemListElement.length, 60, `${path} lists the cards of the page`);
      assert.deepEqual(list.itemListElement[0], { '@type': 'ListItem', position: 1, name: 'Публичная карта 1', url: firstCard }, `${path} first card`);
    }

    // The second page keeps the listing's identity and continues the positions.
    const second = entityGraph(await (await fetch(`${runtime.nextOrigin}/standard/cards/standard/?page=2`)).text(), '/standard/cards/standard/');
    assert.equal(second[0]['@id'], 'https://hearthpulse.net/standard/cards/standard/#collection');
    assert.equal(second[0].mainEntity.numberOfItems, 3000);
    assert.equal(second[0].mainEntity.itemListElement[0].position, 61);
    assert.equal(second[0].mainEntity.itemListElement.at(-1).position, 120);
    assert.equal(second[1].itemListElement.length, 3);
  } finally {
    await runtime.close();
  }
});

test('every SEO registry page takes its title, description and share metadata from the registry', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    for (const page of REGISTRY_PAGES) {
      const response = await fetch(`${runtime.nextOrigin}${page.url}`, { redirect: 'manual' });
      assert.equal(response.status, 200, page.path);
      const html = await response.text();
      assertOnce(html, /<title>([^<]*)<\/title>/g, page.title, `${page.path} title`);
      assertOnce(html, /<meta name="description" content="([^"]*)"/g, page.description, `${page.path} description`);
      assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${page.path} must render exactly one H1`);
      if (!page.sitemap) {
        assertOnce(html, /<meta name="robots" content="([^"]*)"/g, 'noindex, nofollow', `${page.path} robots`);
        assert.doesNotMatch(html, /<link rel="canonical"/, `${page.path} must not expose a canonical URL`);
        assert.doesNotMatch(html, /<meta property="og:url"/, `${page.path} must not expose og:url`);
        assert.doesNotMatch(html, /application\/ld\+json/, `${page.path} must not carry structured data`);
        continue;
      }
      const canonical = `https://hearthpulse.net${page.url}`;
      assertOnce(html, /<meta name="robots" content="([^"]*)"/g,
        'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1', `${page.path} robots`);
      assertOnce(html, /<link rel="canonical" href="([^"]*)"/g, canonical, `${page.path} canonical`);
      assertOnce(html, /<meta property="og:title" content="([^"]*)"/g, page.title, `${page.path} og:title`);
      assertOnce(html, /<meta property="og:description" content="([^"]*)"/g, page.description, `${page.path} og:description`);
      assertOnce(html, /<meta property="og:url" content="([^"]*)"/g, canonical, `${page.path} og:url`);
      assertOnce(html, /<meta name="twitter:title" content="([^"]*)"/g, page.title, `${page.path} twitter:title`);
      assertOnce(html, /<meta name="twitter:description" content="([^"]*)"/g, page.description,
        `${page.path} twitter:description`);
    }

    const shareAlt = async path => (await head(runtime.nextOrigin, path)).match(/<meta property="og:image:alt" content="([^"]*)"/)?.[1];
    assert.notEqual(await shareAlt('/cosmetics/'), await shareAlt('/cosmetics/heroes/'),
      'the cosmetics hub is not the hero skins listing');

    // The legal documents must stay readable without JavaScript.
    const legalPages = JSON.parse(readFileSync('src/modules/legalPages/content.json', 'utf8')).pages;
    for (const [kind, legal] of Object.entries(legalPages)) {
      const html = await (await fetch(`${runtime.nextOrigin}/${kind}/`)).text();
      const text = visibleText(html);
      assert.ok(text.includes(legal.title), `${kind} title`);
      for (const section of legal.sections) {
        assert.ok(text.includes(section.heading), `${kind} heading: ${section.heading}`);
        for (const paragraph of section.paragraphs) {
          const expected = paragraph.replace('{{telegram}}', 'Telegram Manacost')
            .replace('{{privacy}}', 'Политика конфиденциальности');
          assert.ok(text.includes(expected), `${kind} paragraph: ${expected.slice(0, 60)}`);
        }
      }
    }
  } finally {
    await runtime.close();
  }
});

test('registry pages without request input stay prerendered', () => {
  const prerendered = Object.keys(JSON.parse(readFileSync('apps/public-web/.next/prerender-manifest.json', 'utf8')).routes);
  for (const path of ['/faq', '/privacy', '/terms', '/developers/api', '/connect']) {
    assert.ok(prerendered.includes(path), `${path} must not read the request in generateMetadata`);
  }
});

test('indexable Next pages take their robots directives from the shared URL policy', () => {
  const sources = readdirSync('apps/public-web', { recursive: true })
    .filter(file => /\.tsx?$/.test(file))
    .map(file => join('apps/public-web', file));
  const handWritten = sources.filter(file => /robots:\s*\{\s*index:\s*(?:true|policy)/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(handWritten, [], 'use policy.robots or INDEXABLE_ROBOTS so preview directives are not dropped');
});

// ── Title and description with the date of the data (E9 S1) ──
// Real Next on a fake Express: the teasers carry the date, so what is checked is
// what a search engine and a reader without JavaScript get from the same HTML.

const HOUR = 3_600_000;
const MONTHS = { января: 'январь', февраля: 'февраль', марта: 'март', апреля: 'апрель', мая: 'май', июня: 'июнь',
  июля: 'июль', августа: 'август', сентября: 'сентябрь', октября: 'октябрь', ноября: 'ноябрь', декабря: 'декабрь' };
const MONTH_NAMES = Object.values(MONTHS).join('|');
const GENITIVE_MONTHS = Object.keys(MONTHS).join('|');

const metaTeaser = (updatedAt, rows) => ({
  format: 'standard', formatLabel: 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда', period: 'patch_36.6.3',
  availablePeriods: ['past_day', 'past_week', 'patch_36.6.3'], currentPeriod: 'patch_36.6.3', currentPatchPeriod: 'patch_36.6.3',
  coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: 'https://www.hsguru.com/meta', translationSource: '', updatedAt,
  items: rows.map(([label, winrate, games], index) => ({ id: `m${index}`, slug: `m${index}`, archetype: label, archetypeLabel: label,
    translated: true, classKey: 'warlock', winrate, popularity: 20.4, games, turns: 8, durationMinutes: 7, climbingSpeed: 1 })),
});
const archetypeItem = (slug, label, format = 'standard') => ({
  slug, format, classKey: 'warlock', archetype: label, archetypeLabel: label, translated: true, games: 14800, winrate: 61.24,
  popularity: 20.4, turns: 8, durationMinutes: 7, climbingSpeed: 1, deckCount: 3, sourceUrl: 'https://www.hsguru.com/archetype',
  builds: [{ deckCode: 'PAID_BUILD_CODE' }],
});
const TOP_ROWS = [['Зоолок', 61, 14800], ['Граб\'Зи К\'тун Шаман', 58.2, 5400], ['Н\'зот Чернокнижник', 57.4, 258]];
const LONGEST_LABEL = 'Колода-завоеватель с очень-очень длинным названием архетипа Стандарта';

function startFakeExpress(state) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const detail = url.pathname.match(/^\/api\/constructed-archetypes\/teaser\/(standard|wild)\/([a-z0-9-]+)$/);
    let payload = null;
    if (url.pathname === '/api/auth/me') payload = { user: null };
    else if (url.pathname === '/api/standard-meta/teaser') payload = state.meta;
    else if (url.pathname === '/api/constructed-archetypes/teaser') {
      const format = url.searchParams.get('format') ?? 'standard';
      payload = state.catalog && {
        format, formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт', patch: '36.6.3', period: 'patch_36.6.3', minimumGames: 50,
        updatedAt: state.catalog.updatedAt, coverage: {},
        items: state.catalog.labels.map((label, index) => archetypeItem(`a-${index}`, label, format)),
      };
    } else if (detail) {
      payload = state.detail && {
        format: detail[1], formatLabel: detail[1] === 'wild' ? 'Вольный' : 'Стандарт', patch: '36.6.3', minimumGames: 50,
        updatedAt: state.detail.updatedAt, item: archetypeItem(detail[2], state.detail.label, detail[1]), featuredBuild: null,
      };
    }
    response.setHeader('Content-Type', 'application/json');
    response.writeHead(payload ? 200 : 503).end(JSON.stringify(payload ?? { error: 'fixture has no data' }));
  });
}

test('meta, catalog and archetype pages carry the date and numbers of their data in title and description', { timeout: 180_000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before browser QA');
  const state = { meta: null, catalog: null, detail: null };
  const express = startFakeExpress(state);
  express.listen(0, '127.0.0.1');
  await once(express, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${express.address().port}` });
  const page = async path => {
    // /standard/meta/ is prerendered: mark it stale so the next request regenerates it from the fixture.
    if (path === '/standard/meta/') {
      assert.equal((await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).status, 200);
    }
    const response = await fetch(`${next.origin}${path}`);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const title = decoded(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
    const description = decoded(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
    assertOnce(html, /<meta property="og:title" content="([^"]*)"/g, title, `${path} og:title`);
    assertOnce(html, /<meta name="twitter:title" content="([^"]*)"/g, title, `${path} twitter:title`);
    assertOnce(html, /<meta property="og:description" content="([^"]*)"/g, description, `${path} og:description`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${path} renders exactly one H1`);
    assert.ok(title.length <= 65, `${path} title is ${title.length} characters`);
    assert.ok(description.length <= 160, `${path} description is ${description.length} characters`);
    return { html, title, description, text: visibleText(html).replaceAll(' ', ' ') };
  };
  try {
    // Fresh data: the month in the title, the full date, the leader and the source in the description.
    const updatedAt = new Date(Date.now() - 3 * HOUR).toISOString();
    state.meta = metaTeaser(updatedAt, TOP_ROWS);
    const meta = await page('/standard/meta/');
    const [, titleMonth] = meta.title.match(new RegExp(`^Мета Hearthstone (${MONTH_NAMES}) \\d{4}: тир-лист колод \\| HearthPulse$`));
    const [, date, dateMonth, dateYear] = meta.description.match(new RegExp(
      `^Мета Хартстоуна \\(хс\\) на (\\d{1,2} (${GENITIVE_MONTHS}) (\\d{4})): тир-лист колод Стандарта\\. Лидер — Зоолок, 61% побед\\. .*Данные HSGuru\\.$`));
    assert.equal(titleMonth, MONTHS[dateMonth], 'the title names the month of the date in the description');
    assert.ok(meta.title.includes(dateYear));
    assert.equal(meta.description.split('(хс)').length - 1, 1, 'one «(хс)»');
    assert.doesNotMatch(meta.title, /HSGuru/);
    assert.doesNotMatch(meta.description, /Н'зот|258/, 'a row below 1000 games is not in the snippet');
    // The same HTML shows the same date, the slice and the source without JavaScript.
    assert.ok(meta.text.includes(`Данные на ${date}, `), 'the visible line carries the date of the description');
    assert.match(meta.text, / МСК · Стандарт · Алмаз — Легенда · период «Патч 36\.6\.3» · от 100 игр · источник HSGuru\./);
    assert.ok(meta.text.includes('срез бесплатного предпросмотра'), 'the line says it is the free preview');
    assert.match(meta.html, new RegExp(`<time datetime="${updatedAt}">`, 'i'), 'the date is machine-readable');
    assert.ok(meta.html.includes('<a href="https://www.hsguru.com/meta" rel="noopener noreferrer">HSGuru</a>'), 'the source is linked');
    assert.ok(meta.text.includes('Зоолок') && meta.text.includes('61%'), 'the leader of the snippet is on the page');

    // No row of 1000 games: no leader, the rest of the snippet stays.
    state.meta = metaTeaser(updatedAt, [['Шум', 70, 999], ['Пусто', 55, 120]]);
    const noLeader = await page('/standard/meta/');
    assert.doesNotMatch(noLeader.description, /Лидер/);
    assert.match(noLeader.description, new RegExp(`^Мета Хартстоуна \\(хс\\) на (${date}): тир-лист колод Стандарта\\. Винрейт и популярность архетипов\\. Данные HSGuru\\.$`));

    // A row without a winrate is never the leader; a source outside HSGuru is not linked as «HSGuru».
    state.meta = { ...metaTeaser(updatedAt, [['Без винрейта', null, 5000], ['Зоолок', 61, 14800]]),
      sourceUrl: 'https://evil.example/meta' };
    const foreign = await page('/standard/meta/');
    assert.ok(foreign.description.includes('Лидер — Зоолок, 61% побед.'), foreign.description);
    assert.ok(foreign.text.includes('источник HSGuru.'), 'the source is still named');
    assert.ok(!foreign.html.includes('<a href="https://evil.example'), 'a foreign source address is not a link');

    // Older than a week: no month in the title, «обновлено» and the date in the description, the line stays.
    state.meta = metaTeaser('2026-09-01T09:00:00.000Z', TOP_ROWS);
    const stale = await page('/standard/meta/');
    assert.equal(stale.title, `Мета Hearthstone ${YEAR}: тир-лист колод | HearthPulse`);
    assert.equal(stale.description,
      'Мета Хартстоуна (хс), обновлено 1 сентября 2026: тир-лист колод Стандарта. Лидер — Зоолок, 61% побед. Винрейт и популярность архетипов. Данные HSGuru.');
    assert.ok(stale.text.includes('Данные на 1 сентября 2026, 12:00 МСК'));

    // No data: the static text with the year, no date and no numbers, a normal page and a quiet log.
    state.meta = null;
    const none = await page('/standard/meta/');
    assert.equal(none.title, `Мета Hearthstone ${YEAR}: тир-лист колод | HearthPulse`);
    assert.equal(none.description, REGISTRY_PAGES.find(entry => entry.path === '/standard/meta').description);
    assert.doesNotMatch(none.text, /Данные на /);
    assert.doesNotMatch(next.output(), /error/i, 'a missing teaser is not an error');

    // Catalog: month in the title; date and count in the description; no promise of deck codes.
    state.catalog = { updatedAt, labels: ['Зоолок', 'Мурлоки', 'Контроль Воин'] };
    const catalog = await page('/standard/archetypes/');
    assert.match(catalog.title, new RegExp(`^Архетипы Hearthstone: винрейт, (${MONTH_NAMES}) \\d{4} \\| HearthPulse$`));
    assert.match(catalog.description, new RegExp(
      `^Архетипы колод Хартстоуна \\(хс\\) на ${date}: 3 архетипа Стандарта — винрейт, популярность и число игр\\. Данные HSGuru\\.$`));
    assert.doesNotMatch(catalog.description, /код/i);
    assert.match(catalog.text, /(^|\D)3 архетипа\s*Нажмите на строку/, 'the count of the snippet is the count on the page');
    const wild = await page('/standard/archetypes/?format=wild');
    assert.ok(wild.description.includes('3 архетипа Вольного формата'));
    state.catalog = null;
    const noCatalog = await page('/standard/archetypes/');
    assert.equal(noCatalog.title, `Архетипы Hearthstone: винрейт, ${YEAR} | HearthPulse`);
    assert.equal(noCatalog.description, REGISTRY_PAGES.find(entry => entry.path === '/standard/archetypes').description);

    // Archetype page, under both URL families: name, month, winrate, games, period and source; the longest name still fits.
    state.detail = { updatedAt, label: 'Зоолок' };
    for (const path of ['/standard/archetypes/standard/zoolock/', '/standard/meta/standard/zoolock/']) {
      const archetype = await page(path);
      assert.match(archetype.title, new RegExp(`^Зоолок — колода Hearthstone, (${MONTH_NAMES}) \\d{4} \\| HearthPulse$`), path);
      assert.match(archetype.description, new RegExp(
        `^Зоолок в Стандарте \\(хс\\) на ${date}: винрейт 61,2%, 14 800 игр, период «Патч 36\\.6\\.3»\\. Данные HSGuru\\.$`), path);
      assert.ok(archetype.text.includes('61,2'), `${path} shows the winrate of the snippet`);
      assert.ok(archetype.text.includes('14 800'), `${path} shows the games of the snippet`);
      assert.doesNotMatch(`${archetype.title} ${archetype.description}`, /стандарт режима|вольный режима|PAID_BUILD_CODE/i);
    }
    const wildArchetype = await page('/standard/archetypes/wild/zoolock/');
    assert.ok(wildArchetype.description.startsWith('Зоолок в Вольном формате (хс) на '), wildArchetype.description);
    state.detail = { updatedAt, label: LONGEST_LABEL };
    const longest = await page('/standard/archetypes/standard/zoolock/');
    assert.ok(longest.title.includes('Hearthstone') && longest.title.startsWith('Колода-завоеватель'), longest.title);
    assert.ok(longest.description.includes(date) && longest.description.endsWith('Данные HSGuru.'), longest.description);
    state.detail = { updatedAt: '2026-09-01T09:00:00.000Z', label: 'Зоолок' };
    const staleArchetype = await page('/standard/archetypes/standard/zoolock/');
    assert.equal(staleArchetype.title, 'Зоолок — колода Hearthstone | HearthPulse');
    assert.ok(staleArchetype.description.startsWith('Зоолок в Стандарте (хс), обновлено 1 сентября 2026: винрейт 61,2%'));
  } finally {
    await next.close();
    express.closeAllConnections();
    await new Promise(resolve => express.close(resolve));
  }
});

test('the meta page stays prerendered with ISR', () => {
  const manifest = JSON.parse(readFileSync('apps/public-web/.next/prerender-manifest.json', 'utf8'));
  assert.equal(manifest.routes['/standard/meta']?.initialRevalidateSeconds, 300,
    '/standard/meta must stay ISR: its metadata reads the same cached teaser as the page');
});

// ── JSON-LD from the data of the page (E9 S2a) ──
// Real Next on a fake Express: the date, the source and the organization of the graph are
// what a search engine reads from the same HTML the reader gets.

const DATA_DATE = '2026-10-28T23:00:04.000Z';
const HSGURU_META = 'https://www.hsguru.com/meta';
const ORGANIZATION = {
  '@type': 'Organization', '@id': 'https://hearthpulse.net/#org', name: 'Manacost', url: 'https://hearthpulse.net/',
  logo: { '@type': 'ImageObject', url: 'https://hearthpulse.net/assets/arena_icon.webp' },
};

/** Runs `scenario` against real Next reading a fake Express; `page(path)` returns the HTML and the JSON-LD graph. */
async function withFakeExpress(scenario) {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before browser QA');
  const state = { meta: null, catalog: null, detail: null };
  const hits = {};
  const express = startFakeExpress(state);
  express.on('request', request => {
    const { pathname } = new URL(request.url, 'http://fixture');
    hits[pathname] = (hits[pathname] ?? 0) + 1;
  });
  express.listen(0, '127.0.0.1');
  await once(express, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${express.address().port}` });
  const page = async path => {
    if (path === '/standard/meta/') {
      assert.equal((await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).status, 200);
    }
    const response = await fetch(`${next.origin}${path}`);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    return { html, graph: jsonLdGraph(html)?.['@graph'] };
  };
  try {
    await scenario({ state, hits, page });
  } finally {
    await next.close();
    express.closeAllConnections();
    await new Promise(resolve => express.close(resolve));
  }
}

const nodeOfType = (graph, type) => graph.find(node => node['@type'] === type);

test('the meta page describes its teaser as a dataset dated by the teaser, from HSGuru, published by the site', { timeout: 180_000 }, async () => {
  await withFakeExpress(async ({ state, page }) => {
    state.meta = metaTeaser(DATA_DATE, TOP_ROWS);
    const { html, graph } = await page('/standard/meta/');
    assert.deepEqual(graph.map(node => node['@type']), ['Organization', 'BreadcrumbList', 'CollectionPage', 'Dataset']);
    assert.deepEqual(graph[0], ORGANIZATION);
    const collection = nodeOfType(graph, 'CollectionPage');
    assert.deepEqual(nodeOfType(graph, 'Dataset'), {
      '@type': 'Dataset', '@id': 'https://hearthpulse.net/standard/meta/#dataset', url: 'https://hearthpulse.net/standard/meta/',
      name: 'Мета Стандарта Hearthstone: винрейт, популярность и число игр архетипов',
      description: 'Срез меты Стандарта Hearthstone по данным HSGuru: винрейт, популярность и число игр архетипов. На странице показан бесплатный срез; полная таблица доступна подписчикам.',
      inLanguage: 'ru', breadcrumb: { '@id': 'https://hearthpulse.net/standard/meta/#breadcrumb' },
      dateModified: DATA_DATE, license: 'https://hearthpulse.net/terms/',
      creator: { '@id': 'https://hearthpulse.net/#org' }, publisher: { '@id': 'https://hearthpulse.net/#org' },
      isBasedOn: { '@type': 'Dataset', name: 'HSGuru: Meta', url: HSGURU_META },
      variableMeasured: [
        { '@type': 'PropertyValue', name: 'Винрейт', unitText: '%' },
        { '@type': 'PropertyValue', name: 'Популярность', unitText: '%' },
        { '@type': 'PropertyValue', name: 'Число игр' },
      ],
      keywords: ['Hearthstone', 'мета Стандарта', 'архетипы', 'винрейт', 'тир-лист колод'],
      about: { '@type': 'VideoGame', name: 'Hearthstone' },
    });
    assert.equal(collection.dateModified, DATA_DATE);
    assert.deepEqual(collection.about, { '@id': 'https://hearthpulse.net/standard/meta/#dataset' });
    // The line the reader sees carries the same instant.
    assert.match(html, new RegExp(`<time datetime="${DATA_DATE}">`, 'i'));
    // Names of metrics, no values: no row of the teaser reaches the graph.
    assert.doesNotMatch(JSON.stringify(graph), /Зоолок|Граб|Н'зот|\b(61|58\.2|57\.4|14800|5400|258)\b|gameMode|temporalCoverage|\{\{/);

    // Data older than a week keeps its true date: the graph never pretends to be fresher than the teaser.
    state.meta = metaTeaser('2026-09-01T09:00:00.000Z', TOP_ROWS);
    const stale = (await page('/standard/meta/')).graph;
    assert.equal(nodeOfType(stale, 'Dataset').dateModified, '2026-09-01T09:00:00.000Z');

    // The source address comes from the teaser, but only an https address on HSGuru is believed.
    state.meta = { ...metaTeaser(DATA_DATE, TOP_ROWS), sourceUrl: 'https://www.hsguru.com/meta?format=1&min_games=100' };
    assert.equal(nodeOfType((await page('/standard/meta/')).graph, 'Dataset').isBasedOn.url,
      'https://www.hsguru.com/meta?format=1&min_games=100');
    state.meta = { ...metaTeaser(DATA_DATE, TOP_ROWS), sourceUrl: 'https://evil.example/meta' };
    const foreign = await page('/standard/meta/');
    assert.equal(nodeOfType(foreign.graph, 'Dataset').isBasedOn.url, HSGURU_META);
    assert.ok(!JSON.stringify(foreign.graph).includes('evil.example'), 'a foreign address is not named as the source');

    // No public date (no teaser, no date, a date from the future): a normal page, a dataset, and no dateModified anywhere.
    const noDate = [null, metaTeaser(null, TOP_ROWS), metaTeaser(new Date(Date.now() + 72 * HOUR).toISOString(), TOP_ROWS)];
    for (const teaser of noDate) {
      state.meta = teaser;
      const { graph: bare } = await page('/standard/meta/');
      assert.deepEqual(bare.map(node => node['@type']), ['Organization', 'BreadcrumbList', 'CollectionPage', 'Dataset']);
      assert.doesNotMatch(JSON.stringify(bare), /dateModified/);
      assert.deepEqual(nodeOfType(bare, 'Dataset').isBasedOn, { '@type': 'Dataset', name: 'HSGuru: Meta', url: HSGURU_META });
    }
  });
});

test('the catalog dataset is dated by the catalog and the page asks the API once', { timeout: 180_000 }, async () => {
  await withFakeExpress(async ({ state, hits, page }) => {
    state.catalog = { updatedAt: DATA_DATE, labels: ['Зоолок', 'Мурлоки', 'Контроль Воин'] };
    const { graph } = await page('/standard/archetypes/');
    assert.equal(hits['/api/constructed-archetypes/teaser'], 1, 'title, page and JSON-LD share one read');
    assert.deepEqual(graph.map(node => node['@type']), ['Organization', 'BreadcrumbList', 'Dataset']);
    const dataset = nodeOfType(graph, 'Dataset');
    assert.equal(dataset.dateModified, DATA_DATE, 'the date of the catalog, not the day of the request');
    assert.deepEqual(dataset.isBasedOn, { '@type': 'Dataset', name: 'HSGuru: Meta', url: HSGURU_META });
    assert.deepEqual(dataset.variableMeasured.map(variable => variable.name), ['Винрейт', 'Популярность', 'Число игр']);
    assert.deepEqual(dataset.creator, { '@id': 'https://hearthpulse.net/#org' });
    assert.doesNotMatch(JSON.stringify(graph), /PAID_BUILD_CODE|deckCode|Зоолок|gameMode|temporalCoverage|P7D/);
    const wild = (await page('/standard/archetypes/?format=wild')).graph;
    assert.equal(nodeOfType(wild, 'Dataset').dateModified, DATA_DATE);

    state.catalog = { updatedAt: null, labels: ['Зоолок'] };
    const undated = (await page('/standard/archetypes/')).graph;
    assert.deepEqual(undated.map(node => node['@type']), ['Organization', 'BreadcrumbList', 'Dataset']);
    assert.doesNotMatch(JSON.stringify(undated), /dateModified/);
    state.catalog = null;
    assert.doesNotMatch(JSON.stringify((await page('/standard/archetypes/')).graph), /dateModified/);
  });
});

test('statistics pages without a public date carry no date, and the tier-list contents lists are gone', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    const graphOf = async path => jsonLdGraph(await (await fetch(`${runtime.nextOrigin}${path}`)).text())['@graph'];
    for (const path of ['/standard/matchups/', '/standard/vicious-gold/', '/classes/', '/tierlist/']) {
      const graph = await graphOf(path);
      assert.deepEqual(graph[0], ORGANIZATION, `${path} defines the organization`);
      const dataset = nodeOfType(graph, 'Dataset');
      assert.ok(dataset.isBasedOn && dataset.variableMeasured.length > 0, `${path} names its source and metrics`);
      assert.deepEqual(dataset.creator, { '@id': 'https://hearthpulse.net/#org' }, `${path} creator`);
      assert.doesNotMatch(JSON.stringify(graph), /dateModified|temporalCoverage|P7D|gameMode|\{\{/, `${path} has no invented date or window`);
    }
    assert.equal(nodeOfType(await graphOf('/classes/'), 'Dataset').description.includes('11'), false);
    for (const path of ['/tierlist/', '/legendaries/', '/battlegrounds/tier-list/']) {
      const graph = await graphOf(path);
      assert.equal(graph.some(node => node['@type'] === 'ItemList'), false, `${path} has no contents list`);
      assert.doesNotMatch(JSON.stringify(graph), /numberOfItems/, `${path} hard-codes no size`);
    }
  } finally {
    await runtime.close();
  }
});

test('the datasets take their date from what the real backend serves: the fetch time of the HSGuru fixture', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, externalRoutes: metaExternalRoutes });
  try {
    // The meta page is prerendered: mark it stale so the next request reads the fixture.
    assert.equal((await fetch(`${runtime.nextOrigin}/health/next/revalidate/`, { method: 'POST' })).status, 200);
    for (const [path, types] of [
      ['/standard/meta/', ['Organization', 'BreadcrumbList', 'CollectionPage', 'Dataset']],
      ['/standard/archetypes/', ['Organization', 'BreadcrumbList', 'Dataset']],
    ]) {
      const html = await (await fetch(`${runtime.nextOrigin}${path}`)).text();
      const graph = jsonLdGraph(html)['@graph'];
      assert.deepEqual(graph.map(node => node['@type']), types, path);
      const dataset = nodeOfType(graph, 'Dataset');
      assert.equal(dataset.dateModified, '2026-10-25T12:00:00.000Z', `${path} is dated by the fixture's fetched_at`);
      assert.deepEqual(dataset.isBasedOn, { '@type': 'Dataset', name: 'HSGuru: Meta', url: HSGURU_META }, path);
      assert.equal(JSON.stringify(graph).includes(CONTROL_WARRIOR_DECK_CODE), false, `${path} carries no deck code`);
    }
  } finally {
    await runtime.close();
  }
});

// ── Archetype pages: robots by rule, the summary text, the JSON-LD, nothing paid (E9 S3a) ──
// Real Next on a fake Express whose upstream answers carry deck codes, builds, history and
// analysis, as the real one does for a subscriber: none of it may reach any HTML a guest gets.

const PAID_MARKERS = ['AAEBAZSentinelPaidDeckCode0123456789', 'PRIVATE_HISTORY', 'PRIVATE_ANALYSIS', 'PRIVATE_ACCOUNT', 'PRIVATE_FEATURED_DECK'];
const DECK_CODE = /AAE[A-Za-z0-9+/=]{12,}/;

const catalogRow = (format, slug, label, english, classKey, games, winrate, popularity, deckCount) => ({
  slug, format, classKey, archetype: english, archetypeLabel: label, translated: true, games, winrate, popularity,
  turns: 8, durationMinutes: 7, climbingSpeed: 1, deckCount, sourceUrl: `https://www.hsguru.com/archetype/${encodeURIComponent(english)}`,
  builds: [{ deckCode: PAID_MARKERS[0], games: 100, winrate: 50 }],
});
// Ten rows have a winrate over 1000 games (median 51,25); five of them are warlocks (median 52).
const STANDARD_ROWS = [
  catalogRow('standard', 'zoolock', 'Зоолок', 'Zoolock', 'warlock', 14800, 61.24, 20.4, 3),
  catalogRow('standard', 'cube-warlock', 'Куб Чернокнижник', 'Cube Warlock', 'warlock', 9000, 55.5, 8, 2),
  catalogRow('standard', 'handlock', 'Ханделок', 'Handlock', 'warlock', 5000, 52, 5, 2),
  catalogRow('standard', 'wincon-warlock', 'Вин-кон Чернокнижник', 'Wincon Warlock', 'warlock', 2000, 49, 2, 1),
  catalogRow('standard', 'anyfin-warlock', 'Анифин Чернокнижник', 'Anyfin Warlock', 'warlock', 1200, 47.5, 1, 1),
  catalogRow('standard', 'weak-warlock', 'Слабый Чернокнижник', 'Weak Warlock', 'warlock', 500, 50, 0.2, 0),
  catalogRow('standard', 'nzoth-warlock', 'Н\'зот Чернокнижник', 'Nzoth Warlock', 'warlock', 258, 57.4, 0, 0),
  catalogRow('standard', 'mage-a', 'Маг А', 'Mage A', 'mage', 7000, 53, 6, 2),
  catalogRow('standard', 'mage-b', 'Маг Б', 'Mage B', 'mage', 3000, 50, 3, 2),
  catalogRow('standard', 'rogue-a', 'Разбойник А', 'Rogue A', 'rogue', 2500, 48, 2, 1),
  catalogRow('standard', 'hunter-a', 'Охотник А', 'Hunter A', 'hunter', 4000, 51.5, 4, 2),
  catalogRow('standard', 'pure-paladin', 'Чистый Паладин', 'Pure Paladin', 'paladin', 53208, 51, 1.7, 86),
  catalogRow('standard', 'archmage-paladin', 'Чистый Паладин', 'Archmage Paladin', 'paladin', 598, 49, 0, 5),
  catalogRow('standard', 'rare-priest', 'Редкий Жрец', 'Rare Priest', 'priest', 300, 52, 0.04, 1),
];
const WILD_ROWS = [
  catalogRow('wild', 'zoolock', 'Зоолок', 'Zoolock', 'warlock', 20000, 58, 10, 3),
  ...['a', 'b', 'c', 'd'].map((letter, index) => catalogRow('wild', `wild-${letter}`, `Вольный ${letter}`, `Wild ${letter}`, 'warlock', 3000 - index * 100, 50, 1, 1)),
];

function startArchetypeExpress(state) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const detail = url.pathname.match(/^\/api\/constructed-archetypes\/teaser\/(standard|wild)\/([a-z0-9-]+)$/);
    const rowsOf = format => (format === 'wild' ? WILD_ROWS : STANDARD_ROWS);
    let status = 200;
    let payload = { error: 'fixture has no data' };
    if (url.pathname === '/api/auth/me') payload = { user: null };
    else if (url.pathname === '/api/constructed-archetypes/teaser') {
      const format = url.searchParams.get('format') === 'wild' ? 'wild' : 'standard';
      if (state.catalogOk) {
        payload = { format, formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт', patch: 'black_empire_ban', period: 'black_empire_ban',
          minimumGames: 50, updatedAt: state.updatedAt, coverage: {}, items: rowsOf(format) };
      } else status = 503;
    } else if (detail) {
      const item = rowsOf(detail[1]).find(row => row.slug === detail[2]);
      if (!item) status = 404;
      else payload = {
        format: detail[1], formatLabel: detail[1] === 'wild' ? 'Вольный' : 'Стандарт', patch: 'black_empire_ban', minimumGames: 50,
        updatedAt: state.updatedAt, account: 'PRIVATE_ACCOUNT', item,
        featuredBuild: { games: 2216, winrate: 57.1, updatedAt: null, sampleRank: 'all', samplePeriod: 'past_30_days', deckCode: 'PRIVATE_FEATURED_DECK' },
        history: [{ recordedAt: 'PRIVATE_HISTORY' }], analysis: { private: 'PRIVATE_ANALYSIS' },
      };
    } else status = 503;
    response.setHeader('Content-Type', 'application/json');
    response.writeHead(status).end(JSON.stringify(payload));
  });
}

const countWords = text => text.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
/** A page of the summary reads 150–250 words without JavaScript, whatever the catalog said. */
const assertLength = ({ text }, name) => {
  const words = countWords(text);
  assert.ok(words >= 150 && words <= 250, `${name}: the summary has ${words} words`);
};
const numbersIn = (value, found = []) => {
  if (typeof value === 'number') found.push(value);
  else if (Array.isArray(value)) value.forEach(item => numbersIn(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) if (key !== 'position') numbersIn(child, found);
  }
  return found;
};

test('archetype pages: only a strong Standard archetype is indexable; every page carries the summary and nothing paid', { timeout: 180_000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before browser QA');
  const state = { catalogOk: true, updatedAt: new Date(Date.now() - 3 * HOUR).toISOString() };
  const express = startArchetypeExpress(state);
  express.listen(0, '127.0.0.1');
  await once(express, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${express.address().port}` });
  const fetched = [];
  const page = async path => {
    const response = await fetch(`${next.origin}${path}`);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    fetched.push([path, html]);
    const summary = html.match(/<section class="archetype-seo-summary"[\s\S]*?<\/section>/)?.[0] ?? '';
    return {
      html, summary, text: visibleText(summary.replace(/<\/(?:h2|p|li)>/g, '$& ')).replaceAll('\u00a0', ' '),
      robots: html.match(/<meta name="robots" content="([^"]*)"/)?.[1],
      canonical: html.match(/<link rel="canonical" href="([^"]*)"/)?.[1],
      title: decoded(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''),
      graphs: [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]))
        .filter(data => Array.isArray(data['@graph'])),
      links: [...summary.matchAll(/<a href="([^"]+)"/g)].map(match => match[1]),
    };
  };
  try {
    // The strong archetype: indexable, self-canonical, a graph and a summary with the numbers of its teaser.
    const strong = await page('/standard/archetypes/standard/zoolock/');
    assert.equal(strong.robots, 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    assert.equal(strong.canonical, 'https://hearthpulse.net/standard/archetypes/standard/zoolock/');
    assert.match(strong.title, new RegExp(`^Зоолок — колода Hearthstone, (${MONTH_NAMES}) \\d{4} \\| HearthPulse$`));
    assert.equal((strong.html.match(/<h1[\s>]/g) ?? []).length, 1);
    assert.equal((strong.html.match(/<main[\s>]/g) ?? []).length, 1);
    assert.ok(strong.summary.includes('<h2 id="archetype-seo-summary-title">'), 'a question heading, labelling the section');
    assert.ok(strong.text.trim().startsWith('Насколько силён Зоолок в Стандарте сейчас'));
    const words = countWords(strong.text);
    assert.ok(words >= 150 && words <= 250, `the summary has ${words} words`);
    const lead = strong.text.split('Как читать')[0];
    for (const expected of ['Зоолок — архетип класса Чернокнижник в Стандарте Hearthstone', 'По данным HSGuru на ',
      ' МСК за период «Баны»', 'винрейт — 61,2%', 'популярность — 20,4%', 'в выборке 14 800 игр', 'известно 3 сборки']) {
      assert.ok(lead.includes(expected), `the answer says «${expected}»`);
    }
    assert.ok(countWords(lead.split('Медианный')[0]) <= 60, 'the answer comes in the first 60 words');
    for (const expected of ['Медианный винрейт 10 архетипов Стандарта с выборкой от 1 000 игр — 51,3%, а Зоолок выше медианы на 10 п. п.',
      'Среди 5 архетипов класса Чернокнижник с выборкой от 1 000 игр медиана — 52%, а он выше медианы на 9,2 п. п.',
      'По числу игр он на 2-м месте из 14 архетипов Стандарта.', 'В каталог входят архетипы с выборкой от 50 игр',
      'доступны по подписке HearthPulse']) {
      assert.ok(strong.text.includes(expected), `the text says «${expected}»`);
    }
    assert.doesNotMatch(strong.text, /лидер/i, '«лидер» needs its own sample threshold');
    assert.match(strong.summary, new RegExp(`<time datetime="${state.updatedAt}">`, 'i'), 'the date is machine-readable');
    assert.ok(strong.summary.includes('<a href="https://www.hsguru.com/archetype/Zoolock" rel="noopener noreferrer">HSGuru</a>'));
    // Four to six links to the class: pages that can be indexed first, then the rest by games; then the catalog.
    assert.deepEqual(strong.links.filter(href => href.startsWith('/standard/archetypes/standard/')).map(href => href.split('/')[4]), [
      'cube-warlock', 'handlock', 'wincon-warlock', 'anyfin-warlock', 'weak-warlock', 'nzoth-warlock']);
    assert.equal(strong.links.at(-1), '/standard/archetypes/');
    assert.ok(strong.text.includes('Куб Чернокнижник — 55,5%'));

    // The graph: the site, the path, the page and the dataset, with the teaser's numbers as they are.
    assert.equal(strong.graphs.length, 1, 'one JSON-LD script');
    const graph = strong.graphs[0]['@graph'];
    assert.deepEqual(graph.map(node => node['@type']), ['Organization', 'BreadcrumbList', 'ItemPage', 'Dataset']);
    assert.deepEqual(crumbs(nodeOfType(graph, 'BreadcrumbList')), [
      { type: 'ListItem', position: 1, name: 'Архетипы', item: 'https://hearthpulse.net/standard/archetypes/' },
      { type: 'ListItem', position: 2, name: 'Зоолок', item: 'https://hearthpulse.net/standard/archetypes/standard/zoolock/' },
    ]);
    const dataset = nodeOfType(graph, 'Dataset');
    assert.deepEqual(dataset.variableMeasured.map(({ name, value }) => [name, value]),
      [['Винрейт', 61.24], ['Популярность', 20.4], ['Число игр', 14800]]);
    assert.equal(dataset.dateModified, state.updatedAt, 'dated by the teaser, like the <time> of the text');
    assert.equal(nodeOfType(graph, 'ItemPage').dateModified, state.updatedAt);
    assert.deepEqual(dataset.isBasedOn, { '@type': 'Dataset', name: 'HSGuru: Zoolock', url: 'https://www.hsguru.com/archetype/Zoolock' });
    const teaserItem = STANDARD_ROWS[0];
    for (const value of numbersIn(graph)) {
      assert.ok(Object.values(teaserItem).includes(value), `${value} in the JSON-LD is a number of the public teaser`);
      assert.ok(JSON.stringify(teaserItem).includes(JSON.stringify(value)), `${value} is written as the teaser writes it`);
    }

    // Not strong enough, Wild and the old family: noindex, follow, no graph, the same summary.
    const weak = await page('/standard/archetypes/standard/weak-warlock/');
    const wild = await page('/standard/archetypes/wild/zoolock/');
    const legacy = await page('/standard/meta/standard/zoolock/');
    for (const [name, other] of [['weak', weak], ['wild', wild], ['legacy', legacy]]) {
      assert.equal(other.robots, 'noindex, follow', `${name} robots`);
      assert.deepEqual(other.graphs, [], `${name} has no JSON-LD`);
      assertLength(other, name);
    }
    assert.equal(weak.canonical, 'https://hearthpulse.net/standard/archetypes/standard/weak-warlock/');
    assert.equal(legacy.canonical, 'https://hearthpulse.net/standard/meta/standard/zoolock/', 'the old family keeps its own canonical');
    assert.ok(weak.text.includes('Выборка архетипа меньше 1 000 игр, поэтому его винрейт ненадёжен'));
    assert.ok(wild.text.includes('в Вольном формате') && wild.links.at(-1) === '/standard/archetypes/?format=wild');
    for (const [name, other] of [['weak', weak], ['wild', wild], ['legacy', legacy], ['strong', strong]]) {
      assert.equal((other.html.match(/<h1[\s>]/g) ?? []).length, 1, `${name} has one H1`);
    }

    // Two slugs with one Russian name: different titles; a name nobody shares keeps the plain one.
    const pure = await page('/standard/archetypes/standard/pure-paladin/');
    const archmage = await page('/standard/archetypes/standard/archmage-paladin/');
    assert.match(pure.title, /^Чистый Паладин \(Pure Paladin\) — колода Hearthstone/);
    assert.match(archmage.title, /^Чистый Паладин \(Archmage Paladin\) — колода Hearthstone/);
    assert.notEqual(pure.title, archmage.title);
    assert.ok(pure.title.length <= 65 && archmage.title.length <= 65);
    assert.equal(archmage.robots, 'noindex, follow');
    assert.equal(pure.robots, strong.robots);
    // The same name twice: the English one tells the texts apart as it does the titles; a name nobody shares stays plain.
    assert.ok(pure.text.trim().startsWith('Насколько силён Чистый Паладин (Pure Paladin) в Стандарте сейчас Чистый Паладин (Pure Paladin) — архетип класса Паладин'), pure.text.slice(0, 160));
    assert.ok(archmage.text.trim().startsWith('Насколько силён Чистый Паладин (Archmage Paladin) в Стандарте сейчас Чистый Паладин (Archmage Paladin) — архетип класса Паладин'));
    assert.ok(pure.text.includes('Чистый Паладин (Archmage Paladin) — 49%'), 'the twin is named in the class links by the same rule');
    assert.notEqual(pure.text, archmage.text);
    assert.ok(!strong.text.includes('Зоолок ('), 'a name nobody shares has no brackets');
    for (const [name, other] of [['pure', pure], ['archmage', archmage]]) assertLength(other, name);

    // A class with nobody to link to, and a share that rounds to zero.
    const alonePriest = await page('/standard/archetypes/standard/rare-priest/');
    assert.ok(alonePriest.text.includes('популярность — менее 0,1%') && !alonePriest.text.includes('популярность — 0%'));
    assert.ok(alonePriest.text.includes('Что такое архетип') && !alonePriest.text.includes('Другие архетипы'));
    const alone1 = await page('/standard/archetypes/standard/rogue-a/');
    assert.ok(alone1.text.includes('Что такое архетип'), 'the primer takes the place of the class links');
    for (const [name, other] of [['rare priest', alonePriest], ['class of one', alone1], ['strong', strong]]) assertLength(other, name);
    assert.ok(!strong.text.includes('Что такое архетип'), 'a page with its class links has no primer');

    // Without the catalog the page keeps its own numbers, its robots and its graph; the extras go.
    state.catalogOk = false;
    const alone = await page('/standard/archetypes/standard/pure-paladin/');
    assert.equal(alone.robots, strong.robots);
    assert.equal(alone.graphs.length, 1);
    assert.match(alone.title, /^Чистый Паладин — колода Hearthstone/);
    assert.ok(alone.text.includes('в выборке 53 208 игр'));
    assert.ok(!alone.text.includes('Медианный') && !alone.text.includes('Другие архетипы'));
    assert.deepEqual(alone.links.slice(-1), ['/standard/archetypes/'], 'the catalog link stays');
    // The text keeps its length without a word of the catalog: no median, no place, no neighbour, no twin's name.
    const noCatalog = [alone, await page('/standard/archetypes/standard/archmage-paladin/'),
      await page('/standard/archetypes/standard/weak-warlock/'), await page('/standard/archetypes/wild/zoolock/')];
    for (const [index, other] of noCatalog.entries()) {
      assertLength(other, `without the catalog, page ${index}`);
      assert.ok(other.text.includes('Что такое архетип'), `without the catalog, page ${index} has the primer`);
      assert.doesNotMatch(other.text, /Медианный|Среди|месте из|Другие архетипы|\(Pure Paladin\)|\(Archmage Paladin\)|51,3|52%/, `without the catalog, page ${index}`);
      assert.deepEqual(other.links.filter(href => /^\/standard\/archetypes\/(?:standard|wild)\//.test(href)), [], `without the catalog, page ${index} links no archetype`);
    }
    state.catalogOk = true;

    // Nothing paid in any of these documents, RSC payload included.
    assert.ok(fetched.length >= 12);
    for (const [path, html] of fetched) {
      for (const marker of PAID_MARKERS) assert.ok(!html.includes(marker), `${path} leaks ${marker}`);
      assert.doesNotMatch(html, DECK_CODE, `${path} carries a deck code`);
      assert.ok(html.includes('self.__next_f'), `${path} includes the RSC payload the check covers`);
    }
  } finally {
    await next.close();
    express.closeAllConnections();
    await new Promise(resolve => express.close(resolve));
  }
});
