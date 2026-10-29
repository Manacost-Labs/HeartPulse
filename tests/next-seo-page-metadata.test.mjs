import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { startNextServer } from '../scripts/lib/next-server.mjs';
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
      assert.deepEqual(jsonLdGraph(await response.text())?.['@graph'].map(node => node['@type']),
        nodes.map(node => node['@type']), `${path} JSON-LD`);
    }

    // /articles/ is prerendered, so every query gets the same HTML with the
    // canonical page; Nginx marks the paginated URL noindex (nginx-html-routing test).
    const filtered = await head(runtime.nextOrigin, '/articles/?page=2');
    assert.match(filtered, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/articles\/"\/>/);
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
