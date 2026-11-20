import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { visibleText } from '../scripts/lib/post-deploy-data-pages.mjs';
import { closeLocal, listenLocal, publicCardFixture } from './helpers/publicCardFixture.mjs';
import { funDecksPayload, startSlowExpress } from './helpers/slowExpressStub.mjs';

const CARD_PATH = '/api/public/constructed-cards/standard/CARD_QA_1';
const publicCard = id => ({
  card: { id, name: 'Проверочная карта', englishName: 'Probe Card', rulesText: 'Боевой клич: возьмите карту.',
    set: 'CORE', type: 'Существо', rarity: 'COMMON', mana: 2, attack: 2, health: 3, image: null },
  classCode: 'MAGE', dbf: 12345,
});

// The only card Express knows is CARD_QA_1; every card read is recorded. `detail` answers the anonymous card API.
async function startCardApi({ detail = null } = {}) {
  const cardReads = [];
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (detail && request.url.startsWith('/api/constructed-cards/CARD_QA_1?')) {
      response.writeHead(200).end(JSON.stringify(detail));
      return;
    }
    if (request.url.startsWith('/api/public/constructed-cards/')) {
      cardReads.push(request.url);
      const known = request.url === CARD_PATH;
      response.writeHead(known ? 200 : 404).end(JSON.stringify(known ? publicCard('CARD_QA_1') : { error: 'Card not found' }));
      return;
    }
    response.writeHead(request.url.startsWith('/api/auth/me') ? 401 : 404).end('{"error":"Unavailable"}');
  });
  return { server, cardReads, origin: await listenLocal(server) };
}

test('a card page is rendered from the single Express read of the proxy', async () => {
  const api = await startCardApi();
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const known = await fetch(`${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(known.status, 200, next.output());
    assert.match(await known.text(), /<h1>Проверочная карта<\/h1>/);
    assert.deepEqual(api.cardReads, [CARD_PATH], 'the proxy, the metadata and the page share one read');

    // A client cannot supply the projection that the proxy hands to the page.
    const forged = `v1:${Buffer.from(JSON.stringify(publicCard('ABSENT_CARD'))).toString('base64url')}`;
    const absent = await fetch(`${next.origin}/standard/cards/standard/ABSENT_CARD/`, {
      headers: { 'x-hearthpulse-card-public-projection': forged },
    });
    assert.equal(absent.status, 404);
    assert.doesNotMatch(await absent.text(), /Проверочная карта/);
    assert.equal(api.cardReads.length, 2, 'an absent card is read once as well');
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

// What the anonymous card API answers a guest, with paid sentinels where a subscriber would see numbers.
const guestDetail = {
  statsAccess: false,
  mechanicTranslations: { LIFESTEAL: 'Похищение жизни' },
  card: {
    card_id: 'CARD_QA_1', formats: [{ slug: 'standard', name_ru: 'Стандартный' }], mechanics: ['LIFESTEAL'],
    stats: { keepPercentage: 71.7171, openingHandWinrate: 59.5959 },
    wiki: { patch_changes: [{ entries: [{ date: '2026-11-03', patch: 'Patch 37.0.2.256589', items: ['Now costs 4 (Up from 3).'] }] }] },
    related_cards_localized: [{ heading: { ru: 'Награды за задание' }, cards: [{ card_id: 'CARD_QA_1t', name: { ru: 'Проверочный жетон' }, text: { ru: 'Провокация.' } }] }],
    decks: [{ id: 'deck-1', title: 'Zoo', archetype: 'Zoo Warlock', archetypeLabel: 'Проверочный Зоолок', className: 'Warlock',
      deckCode: 'AAECAQcAAA==', winrate: 71.7171, score: 'QA_PRIVATE_SCORE' }],
  },
};

test('a card page shows its open detail without script, and nothing paid', async () => {
  const api = await startCardApi({ detail: guestDetail });
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const response = await fetch(`${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(response.status, 200, next.output());
    const html = await response.text();
    const text = visibleText(html);
    for (const shown of ['Похищение жизни', 'Стоимость: 3 → 4', 'Проверочный жетон', 'Проверочный Зоолок']) {
      assert.ok(text.includes(shown), `the server HTML shows «${shown}»`);
    }
    assert.ok(!text.includes('История изменений не найдена') && !text.includes('Механики не указаны'), 'no false «nothing» where there is data');
    for (const paid of ['71.7171', '59.5959', 'QA_PRIVATE_SCORE']) assert.ok(!html.includes(paid), `no ${paid} in the HTML or its RSC payload`);
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

// A popular card: hundreds of decks and a big generated pool, far over what one page should carry.
const heavyDetail = { ...guestDetail, card: {
  ...guestDetail.card,
  decks: Array.from({ length: 400 }, (_, index) => ({ id: `deck-${index}`, title: 'Zoo', archetype: 'Zoo Warlock',
    archetypeLabel: 'Проверочный Зоолок', className: 'Warlock', deckCode: `AAECAQc${'A'.repeat(300)}`, winrate: 71.7171, score: 'QA_PRIVATE_SCORE' })),
  wiki: { ...guestDetail.card.wiki, generated_card_pools: [{ title: 'Пул', cards: Array.from({ length: 600 }, (_, index) => ({
    card_id: `POOL_${index}`, name: { ru: `Карта пула ${index}` }, text: { ru: 'Наносит 1 ед. урона. '.repeat(10) } })) }] },
} };

test('a popular card keeps its history and first decks within the HTML budget', async () => {
  const api = await startCardApi({ detail: heavyDetail });
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const response = await fetch(`${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(response.status, 200, next.output());
    const html = await response.text();
    const text = visibleText(html);
    for (const shown of ['Похищение жизни', 'Стоимость: 3 → 4', 'Проверочный Зоолок']) {
      assert.ok(text.includes(shown), `the server HTML shows «${shown}»`);
    }
    assert.match(text, /Колоды с этой картой ·\s+12\b/, 'the first twelve decks of 400');
    assert.ok(html.length < 350_000, `the page weighs ${html.length} characters`);
    for (const paid of ['71.7171', 'QA_PRIVATE_SCORE']) assert.ok(!html.includes(paid), `no ${paid}`);
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

test('an answer that claims statistics access is not used: the page is the seed', async () => {
  const api = await startCardApi({ detail: { ...guestDetail, statsAccess: true } });
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const response = await fetch(`${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(response.status, 200, next.output());
    const html = await response.text();
    assert.ok(visibleText(html).includes('Механики не указаны'), 'the seed, without the detail');
    for (const paid of ['71.7171', '59.5959', 'QA_PRIVATE_SCORE', 'Проверочный Зоолок']) assert.ok(!html.includes(paid), `no ${paid}`);
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

test('a card page without its open detail is still the card, from the seed', async () => {
  const api = await startCardApi();
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const response = await fetch(`${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(response.status, 200, next.output());
    const text = visibleText(await response.text());
    assert.ok(text.includes('Проверочная карта') && text.includes('Боевой клич: возьмите карту.'), 'the seed facts and rules text');
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

test('a card page answers a retryable 503 when Express cannot be reached', async () => {
  const api = await startCardApi();
  await closeLocal(api.server);
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const response = await fetch(`${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(response.status, 503, next.output());
    assert.equal(response.headers.get('retry-after'), '300');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.doesNotMatch(await response.text(), /noindex/);
    assert.equal(response.headers.get('x-robots-tag'), null);
  } finally {
    if (next) await next.close();
  }
});

const catalogBody = format => ({
  format, rank: 'legend', period: { id: '1d', label: 'Последний день', patch: null, timeRange: 'LAST_1_DAY' },
  cards: [{ card_id: 'CARD_QA_1', name: { ru: 'Проверочная карта' }, class: 'MAGE', card_type: { slug: 'MINION' },
    images: { card: '/arena-logo-icon.webp' }, mechanics: [], stats: null }],
  facets: { classes: ['MAGE'], sets: ['CORE'], mechanics: [], types: ['MINION'], rarities: ['COMMON'] },
  pagination: { page: 1, perPage: 60, total: 1, totalPages: 1 }, statsAccess: false, datasetVersion: 'fixture', dataStatus: 'fresh',
});

// Express that can be switched to "accepts the connection and never answers", the production incident of 2026-11-15.
async function startStallingApi() {
  const state = { stalled: false, delayMs: 0 };
  const server = http.createServer((request, response) => {
    if (state.stalled && !request.url.startsWith('/api/auth/me')) return;
    if (state.delayMs && !request.url.startsWith('/api/auth/me')) {
      const delay = state.delayMs;
      state.delayMs = 0;
      setTimeout(() => server.emit('request', request, response), delay);
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    if (request.url.startsWith('/api/public/constructed-cards/')) {
      const known = request.url === CARD_PATH;
      const big = request.url.endsWith('/CARD_BIG');
      const body = big ? publicCard('CARD_BIG') : publicCard('CARD_QA_1');
      if (big) body.card.rulesText = 'Боевой клич: возьмите карту. '.repeat(400);
      response.writeHead(known || big ? 200 : 404).end(JSON.stringify(known || big ? body : { error: 'Card not found' }));
    } else if (request.url.startsWith('/api/constructed-cards')) {
      response.end(JSON.stringify(catalogBody(request.url.includes('format=wild') ? 'wild' : 'standard')));
    } else {
      response.writeHead(request.url.startsWith('/api/auth/me') ? 401 : 404).end('{"error":"Unavailable"}');
    }
  });
  return { server, state, origin: await listenLocal(server) };
}

// The text of a fragment without its markup. Tags are removed until none is left, so that a tag which only
// appears once another one is cut out cannot survive.
function textOf(markup) {
  let text = markup;
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text.trim();
}

// A landmark of a rendered document: the element `tag` named by `aria-label` (any, when no label), and its links
// as the reader sees them (text without markup, address).
function landmark(html, tag, label) {
  const open = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].find(match => label === undefined || match[0].includes(`aria-label="${label}"`));
  if (!open) return null;
  const end = html.indexOf(`</${tag}>`, open.index);
  const inner = html.slice(open.index, end);
  const links = [...inner.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([^]*?)<\/a>/g)]
    .map(([, href, body]) => ({ text: textOf(body), href }));
  return { html: inner, links };
}

const timed = async url => {
  const started = Date.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  return { response, html: await response.text(), seconds: (Date.now() - started) / 1000 };
};

test('a stalled Express answers the last good card and catalog within two seconds', async () => {
  const api = await startStallingApi();
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    for (const path of ['/standard/cards/standard/CARD_QA_1/', '/standard/cards/', '/standard/cards/wild/']) {
      assert.equal((await timed(next.origin + path)).response.status, 200, `${path} warms the last good version: ${next.output()}`);
    }
    api.state.stalled = true;
    // The 30 s freshness of a catalog is not the point here: every read below must give up on Express itself.
    for (const path of ['/standard/cards/standard/CARD_QA_1/', '/standard/cards/', '/standard/cards/wild/']) {
      const { response, html, seconds } = await timed(next.origin + path);
      assert.equal(response.status, 200, `${path}: ${next.output()}`);
      assert.ok(seconds < 3.5, `${path} answered after ${seconds}s`);
      assert.match(html, /Проверочная карта/);
    }
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

test('a stalled Express without a last good version is a quick 503 that stays indexable', async () => {
  const api = await startStallingApi();
  api.state.stalled = true;
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    for (const path of ['/standard/cards/standard/CARD_QA_1/', '/standard/cards/', '/standard/cards/standard/', '/standard/cards/wild/']) {
      const { response, html, seconds } = await timed(next.origin + path);
      assert.equal(response.status, 503, `${path}: ${next.output()}`);
      assert.ok(seconds < 3.5, `${path} answered after ${seconds}s, not the former ten`);
      assert.ok(response.headers.get('retry-after'), `${path} needs Retry-After`);
      assert.equal(response.headers.get('x-robots-tag'), null, `${path} must not carry noindex`);
      assert.doesNotMatch(html, /noindex|index, follow/, `${path} body must not carry robots directives`);
    }
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

test('filtered and paged catalog addresses never answer 500 while Express is stalled', async () => {
  const api = await startStallingApi();
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    assert.equal((await timed(next.origin + '/standard/cards/')).response.status, 200, next.output());
    api.state.stalled = true;
    for (const path of ['/standard/cards/?class=MAGE', '/standard/cards/standard/?page=2', '/standard/cards/wild/?mana=2']) {
      const { response, html, seconds } = await timed(next.origin + path);
      assert.equal(response.status, 503, `${path}: ${next.output()}`);
      assert.ok(seconds < 3.5, `${path} answered after ${seconds}s`);
      assert.ok(response.headers.get('retry-after'), `${path} needs Retry-After`);
      assert.equal(response.headers.get('x-robots-tag'), null);
      assert.doesNotMatch(html, /noindex|index, follow/, `${path} must not mix robots directives`);
    }
    api.state.stalled = false;
    assert.equal((await timed(next.origin + '/standard/cards/?class=MAGE')).response.status, 200);
    api.state.stalled = true;
    const { response, html } = await timed(next.origin + '/standard/cards/?class=MAGE');
    assert.equal(response.status, 200, 'a filtered list has its own last good version');
    assert.match(html, /Проверочная карта/);
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

test('a card whose projection exceeds the request header is still served from the last good copy', async () => {
  const api = await startStallingApi();
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const path = '/standard/cards/standard/CARD_BIG/';
    const warm = await timed(next.origin + path);
    assert.equal(warm.response.status, 200, next.output());
    api.state.stalled = true;
    const { response, html, seconds } = await timed(next.origin + path);
    assert.equal(response.status, 200, `a large card must not turn into 503: ${next.output()}`);
    assert.ok(seconds < 5.5, `answered after ${seconds}s`);
    assert.match(html, /Проверочная карта/);
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

test('a slow but live Express costs one 503 for a cold card and a cold catalog, then the late answer serves the next visit', async () => {
  const api = await startStallingApi();
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    for (const path of ['/standard/cards/standard/CARD_QA_1/', '/standard/cards/']) {
      api.state.delayMs = 3000;
      const slow = await timed(next.origin + path);
      assert.equal(slow.response.status, 503, `${path}: ${next.output()}`);
      assert.ok(slow.seconds < 3, `${path} gave up after ${slow.seconds}s`);
      await new Promise(resolve => setTimeout(resolve, 1800));
      api.state.stalled = true;
      const warm = await timed(next.origin + path);
      assert.equal(warm.response.status, 200, `${path} must be warmed by the read that outlived its deadline: ${next.output()}`);
      api.state.stalled = false;
    }
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

// The outage page is a site page, not a bare stub: header, menu, search, text, footer, all without Express.
test('the outage page is a full site page that needs neither script nor Express, and keeps its status and headers', async () => {
  const api = await startStallingApi();
  api.state.stalled = true;
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const { response, html } = await timed(`${next.origin}/standard/cards/`);
    assert.equal(response.status, 503, next.output());
    assert.equal(response.headers.get('retry-after'), '300');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.doesNotMatch(html, /noindex|canonical|application\/ld\+json/);
    assert.equal(html.match(/<h1[ >]/g)?.length, 1, 'exactly one h1');
    assert.match(html, /<title>Данные временно недоступны \| HearthPulse<\/title>/);
    for (const label of ['Разделы сайта', 'Основная навигация']) assert.ok(landmark(html, 'nav', label), `a menu named «${label}»`);
    assert.ok(landmark(html, 'footer', 'Подвал сайта'), 'a footer');
    assert.match(html, /<form[^>]*role="search"/);
    assert.match(html, /<a [^>]*href="">Повторить<\/a>/);
    const sections = landmark(html, 'main', undefined).links.map(link => link.href);
    for (const path of ['/tierlist/', '/standard/meta/', '/heroes/']) assert.ok(sections.includes(path), `the page offers ${path}`);
    assert.doesNotMatch(html, /backend|Express|на главную<\/a>/i, 'no technical words in the copy');
    // Nothing on the page reads data: no script source, no request to the API, no fetch.
    assert.doesNotMatch(html, /<script[^>]*src=|fetch\(|XMLHttpRequest|["'(]\/api\/(?!v1\/openapi\.json)/);
    const head = await fetch(`${next.origin}/standard/cards/`, { method: 'HEAD' });
    assert.equal(head.status, 503);
    assert.equal(await head.text(), '');
    // A client-side read is not a document: it never gets the page.
    const script = await fetch(`${next.origin}/standard/cards/`, { headers: { rsc: '1', 'sec-fetch-dest': 'empty' } });
    assert.notEqual(script.status, 503, 'an RSC or fetch read must keep its in-app error state');
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

// The outage page is a stand-in for the site shell, so its menu and footer are compared with the shell the
// same server renders for an ordinary page. Differences are named: the stand-in lists «Главная» (the site
// shows the logo instead) and, for the footer, nothing else.
test('the outage page menu and footer list the same links as the site shell', async () => {
  const api = await startStallingApi();
  api.state.stalled = true;
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const outage = (await timed(`${next.origin}/standard/cards/`)).html;
    const siteShell = (await timed(`${next.origin}/faq/`)).html;
    // The site's mode switch (four banner links to the main page of each mode) is not a menu item: its pages are
    // listed as items too, so the comparison reads the items only.
    const site = siteShell.replace(/<div class="hp-mode-panel"[\s\S]*?<\/div><\/details>/g, '</details>');
    const siteMenu = landmark(site, 'nav', 'Разделы сайта').links;
    const outageMenu = landmark(outage, 'nav', 'Основная навигация').links;
    assert.ok(siteMenu.length >= 20, `the site shell lists its menu (${siteMenu.length} links)`);
    assert.deepEqual(siteMenu[0], { text: 'Главная', href: '/' }, 'the site menu starts with the home link');
    assert.deepEqual(outageMenu, siteMenu, 'same items, labels, paths and order as the site menu');
    assert.deepEqual(landmark(outage, 'nav', 'Разделы сайта').links, outageMenu, 'the phone drawer lists the same items');
    const siteFooter = landmark(site, 'footer', 'Подвал сайта');
    assert.ok(siteFooter.links.length >= 8, 'the site footer lists its links');
    assert.deepEqual(landmark(outage, 'footer', 'Подвал сайта').links, siteFooter.links, 'same footer links in the same order');
    assert.doesNotMatch(landmark(outage, 'footer', 'Подвал сайта').html, /<h[1-6]/, 'the stand-in footer has no heading tags');
    // Without JavaScript the search field is replaced by a plain explanation.
    assert.match(outage, /<noscript>[^]*Поиск по разделам работает только с включённым JavaScript[^]*<\/noscript>/);
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

// Pages that show data read Express while the document is built. Whatever Express does, a document that
// is served as a page must carry the page's data, and a document without any must not look like a page.
// `minWords` is the least a page with its data has (the page without it is 130-290 words shorter).
const DATA_PAGES = [
  { path: '/', minWords: 420, text: 'Статья стенда номер 0' },
  { path: '/leaderboards/', minWords: 500, text: 'TrueBench' },
  { path: '/cosmetics/', minWords: 270, text: 'Облик героя номер 0' },
  { path: '/cosmetics/heroes/', minWords: 270, text: 'Облик героя номер 0' },
  { path: '/cosmetics/coins/', minWords: 180, text: 'Coin 23' },
  { path: '/streamers/', minWords: 250, text: 'reqvam' },
  { path: '/streamers/nohandsgamer/', minWords: 300, text: 'NoHandsGamer' },
  { path: '/standard/patches/', minWords: 3000, text: '' },
  { path: '/standard/archetypes/', minWords: 700, text: 'Архетип fixture-0' },
  { path: '/standard/fun-decks/', minWords: 330, text: 'Колода FREE_DECK_A' },
];
const words = html => visibleText(html).split(/\s+/).filter(Boolean).length;

async function startDataPagesStand() {
  const fixture = await publicCardFixture();
  const express = await startSlowExpress(fixture.legacyOrigin);
  const start = () => startNextServer({ legacyOrigin: express.origin });
  const close = async next => { await next?.close(); await express.close(); await fixture.close(); };
  return { fixture, express, start, close };
}

const expectPage = ({ response, html, seconds }, page, context) => {
  assert.equal(response.status, 200, `${page.path} ${context}`);
  assert.ok(words(html) >= page.minWords, `${page.path} ${context}: ${words(html)} words, expected at least ${page.minWords}`);
  assert.ok(visibleText(html).includes(page.text), `${page.path} ${context} shows its data`);
  assert.ok(seconds < 2, `${page.path} ${context} answered in ${seconds}s`);
};

test('a data page is served with its data while Express is slow, down, and after it recovers', async () => {
  const stand = await startDataPagesStand();
  let next;
  try {
    next = await stand.start();
    for (const page of DATA_PAGES) expectPage(await timed(`${next.origin}${page.path}`), page, 'with a healthy Express');

    // The last answers are older than the two seconds a success is reused; Express answers in three seconds.
    await delay(2500);
    stand.express.setDelay(3000);
    for (const page of DATA_PAGES) {
      const answer = await timed(`${next.origin}${page.path}`);
      expectPage(answer, page, 'with an Express that answers in 3 s');
      if (page.path !== '/') assert.equal(answer.response.headers.get('x-hearthpulse-edge-cache'), 'anonymous', `${page.path} is a full page`);
    }

    stand.express.setDelay(0);
    stand.express.setDown(true);
    await delay(1500);
    for (const page of DATA_PAGES) expectPage(await timed(`${next.origin}${page.path}`), page, 'with an Express that answers 503');

    // After the recovery the next visit shows what Express says now, not the copy that served the outage.
    stand.express.setDown(false);
    stand.express.routes['/api/fun-decks'] = () => funDecksPayload(['RECOVERED_DECK_A', 'RECOVERED_DECK_B', 'RECOVERED_DECK_C']);
    await delay(1500);
    const recovered = await timed(`${next.origin}/standard/fun-decks/`);
    assert.ok(visibleText(recovered.html).includes('Колода RECOVERED_DECK_C'), 'the recovered Express is read again');
    assert.ok(!visibleText(recovered.html).includes('Колода FREE_DECK_A'), 'the old copy is not kept once Express answers');
  } finally {
    await stand.close(next);
  }
});

test('50 visits to a streamer profile in a row all show the profile while Express answers in three seconds', async () => {
  const stand = await startDataPagesStand();
  let next;
  try {
    next = await stand.start();
    const page = DATA_PAGES.find(candidate => candidate.path === '/streamers/nohandsgamer/');
    expectPage(await timed(`${next.origin}${page.path}`), page, 'at the first visit');
    await delay(2500);
    stand.express.setDelay(3000);
    for (let visit = 1; visit <= 50; visit++) {
      expectPage(await timed(`${next.origin}${page.path}`), page, `at visit ${visit}`);
      await delay(100);
    }
  } finally {
    await stand.close(next);
  }
});

test('with no copy yet a data page is a retryable 503 that is not a page, and the late answer serves the next visit', async () => {
  const stand = await startDataPagesStand();
  let next;
  try {
    stand.express.setDelay(4000);
    next = await stand.start();
    // `/cosmetics/heroes/` reads what `/cosmetics/` has been waiting for: it may already be there.
    for (const page of DATA_PAGES.filter(candidate => candidate.path !== '/' && candidate.path !== '/cosmetics/heroes/')) {
      const answer = await timed(`${next.origin}${page.path}`);
      assert.equal(answer.response.status, 503, page.path);
      assert.equal(answer.response.headers.get('retry-after'), '60', `${page.path} tells when to come back`);
      assert.equal(answer.response.headers.get('cache-control'), 'private, no-store', page.path);
      assert.equal(answer.response.headers.get('x-robots-tag'), null, `${page.path}: a transient outage is not noindex`);
      assert.ok(!page.text || !visibleText(answer.html).includes(page.text), `${page.path} has none of its data`);
      assert.ok(answer.seconds < 2.6, `${page.path} answered in ${answer.seconds}s`);
    }
    // The reads went on in the background; the first of them is in by now.
    await delay(4500);
    stand.express.setDelay(0);
    await delay(500);
    for (const page of DATA_PAGES) expectPage(await timed(`${next.origin}${page.path}`), page, 'after the late answers');
  } finally {
    await stand.close(next);
  }
});

test('the home page without its feeds is not kept for everybody, and a cold start waits for a quick Express', async () => {
  const stand = await startDataPagesStand();
  let next;
  try {
    stand.express.setDelay(4000);
    next = await stand.start();
    const without = await timed(`${next.origin}/`);
    assert.equal(without.response.status, 200, 'the page is useful without its feeds');
    assert.ok(words(without.html) < 400, 'it is the page without the feeds');
    assert.equal(without.response.headers.get('x-hearthpulse-edge-cache'), null, 'the edge may not keep it');
    assert.equal(without.response.headers.get('cache-control'), 'private, no-cache');
    assert.ok(without.seconds < 1.5, `the home page waited ${without.seconds}s`);
    await next.close();
    next = undefined;

    // A first visit of a restarted server, with Express in 1.5 s: more than the old 600 ms, within the two seconds.
    stand.express.setDelay(1500);
    next = await stand.start();
    expectPage(await timed(`${next.origin}/leaderboards/`), DATA_PAGES[1], 'on a cold start with a 1.5 s Express');
  } finally {
    await stand.close(next);
  }
});

test('a page of the open layer is the same for a subscriber, whose answers never enter the shared copies', async () => {
  const stand = await startDataPagesStand();
  let next;
  try {
    stand.fixture.grant();
    // A viewer's read of the fun-deck selection carries decks a guest must never see.
    stand.express.routes['/api/fun-decks'] = request => funDecksPayload(request.headers.cookie
      ? ['PAID_DECK_OLD', 'FREE_DECK_C', 'FREE_DECK_A', 'FREE_DECK_B', 'SUBSCRIBER_ONLY_DECK']
      : ['PAID_DECK_OLDEST', 'PAID_DECK_OLD', 'FREE_DECK_C', 'FREE_DECK_A', 'FREE_DECK_B']);
    next = await stand.start();
    const asSubscriber = await fetch(`${next.origin}/standard/fun-decks/`, {
      headers: { Cookie: stand.fixture.cookie, Authorization: 'Bearer subscriber-token' },
    });
    const subscriberText = visibleText(await asSubscriber.text());
    assert.ok(!subscriberText.includes('SUBSCRIBER_ONLY_DECK'), 'the server never asks Express as the viewer');
    assert.ok(stand.express.state.reads.length > 0);
    assert.deepEqual(stand.express.state.reads.filter(read => read.cookie || read.authorization), [], 'no viewer credential reaches Express');

    // While Express is down the guest is served the stored copy: it is the open layer, not the subscriber's.
    await delay(2500);
    stand.express.setDown(true);
    const guest = await timed(`${next.origin}/standard/fun-decks/`);
    const guestText = visibleText(guest.html);
    assert.equal(guest.response.status, 200);
    for (const code of ['FREE_DECK_A', 'FREE_DECK_B', 'FREE_DECK_C']) assert.ok(guestText.includes(`Колода ${code}`), code);
    for (const code of ['SUBSCRIBER_ONLY_DECK', 'PAID_DECK_OLD']) assert.ok(!guestText.includes(code), `${code} stays out of the guest page`);
  } finally {
    await stand.close(next);
  }
});

test('an unknown streamer is a 404 while Express is slow, not a 503 and not a stored page', async () => {
  const stand = await startDataPagesStand();
  let next;
  try {
    next = await stand.start();
    const answer = await timed(`${next.origin}/streamers/nobody_here/`);
    assert.equal(answer.response.status, 404);
  } finally {
    await stand.close(next);
  }
});
