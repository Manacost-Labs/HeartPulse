import assert from 'node:assert/strict';
import http from 'node:http';
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
