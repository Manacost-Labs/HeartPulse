import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const CARD_PATH = '/api/public/constructed-cards/standard/CARD_QA_1';
const publicCard = id => ({
  card: { id, name: 'Проверочная карта', englishName: 'Probe Card', rulesText: 'Боевой клич: возьмите карту.',
    set: 'CORE', type: 'Существо', rarity: 'COMMON', mana: 2, attack: 2, health: 3, image: null },
  classCode: 'MAGE', dbf: 12345,
});

// The only card Express knows is CARD_QA_1; every card read is recorded.
async function startCardApi() {
  const cardReads = [];
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
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
    assert.match(html, /<header class="topbar[^"]*">/);
    assert.match(html, /<nav class="drawer-nav" aria-label="Разделы сайта">/);
    assert.match(html, /<aside class="rail[^"]*">/);
    assert.match(html, /<form id="site-search" class="search" role="search"/);
    assert.match(html, /<footer class="footer"/);
    assert.match(html, /<a class="btn" href="">Повторить<\/a>/);
    for (const path of ['/tierlist/', '/standard/meta/', '/heroes/']) assert.ok(html.includes(`class="way" href="${path}"`), path);
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

test('the outage page menu and footer match the site menu in both directions, in order', async () => {
  const api = await startStallingApi();
  api.state.stalled = true;
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const { html } = await timed(`${next.origin}/standard/cards/`);
    // The expectation is read from the menu data file itself, not from the module the page imports.
    const data = readFileSync(new URL('../src/app/routing/navigationData.ts', import.meta.url), 'utf8');
    const routes = [...data.matchAll(/\{ id: '([^']+)', label: '([^']+)', path: '(\/[^']*)', group: '([^']+)'/g)]
      .map(([, id, label, path, group]) => ({ id, label, path: path.replace(/\/?$/, '/'), group }));
    assert.ok(routes.length >= 25, 'the menu data is parsed');
    const shown = group => routes.filter(route => route.group === group && route.id !== 'faq');
    const expected = ['home', 'top', 'standard', 'arena', 'bg-primary', 'bg-builder', 'misc'].flatMap(shown).map(route => `${route.label} ${route.path}`);
    const rail = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
    const links = [...rail.matchAll(/class="nav-link" href="([^"]+)">([^<]+)</g)].map(([, path, label]) => `${label} ${path}`);
    assert.deepEqual(links, expected, 'same items, labels, paths and order as the site menu');
    const drawer = html.slice(html.indexOf('<nav class="drawer-nav"'), html.indexOf('</header>'));
    assert.equal([...drawer.matchAll(/class="nav-link"/g)].length, expected.length, 'the phone drawer lists the same items');
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    for (const id of ['home', 'winrates', 'tierlist', 'legendaries', 'articles', 'gallery', 'privacy', 'terms']) {
      const route = routes.find(item => item.id === id);
      assert.ok(footer.includes(`href="${route.path}">${route.label}</a>`), `the footer names ${id} as the menu does`);
    }
    assert.doesNotMatch(footer, /<h[1-6]/, 'the footer has no heading tags');
    // Without JavaScript the search field is replaced by a plain explanation: nothing submits to a page that cannot answer.
    assert.match(html, /<noscript><style>\.utility \.search\{display:none\}<\/style><\/noscript>/);
    assert.match(html, /<noscript><p class="search-note">Поиск по разделам работает только с включённым JavaScript/);
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});
