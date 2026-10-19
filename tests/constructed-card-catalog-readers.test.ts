import express from 'express';
import { once } from 'node:events';
import { createConstructedCardRouter } from '../server/constructedCardRoutes.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { createConstructedCardCatalogReaders, createConstructedCardReader } from '../server/modules/constructedCards/public.js';

type CatalogPorts = Parameters<typeof createConstructedCardCatalogReaders>[0];
function snapshot(version: string, cardId = 'CARD_1') {
  return {
    document: { cards: [{ card_id: cardId, dbf: 10, name: { ru: 'Карта' }, class: 'MAGE', card_set: 'CORE',
      card_type: { slug: 'MINION' }, rarity: 'COMMON', collectible: true, mana_cost: 1, mechanics: [] }],
    datasetVersion: version, verifiedAt: '2026-10-19', publishedAt: '2026-10-18' },
    cacheSource: 'fresh' as const, dataStatus: 'fresh' as const, warning: null,
  };
}
function catalogHarness() {
  const state = { time: 0, generation: 0, reads: 0, stats: 0, history: 0 };
  const cache: CatalogPorts['cache'] = new Map(), jobs: CatalogPorts['jobs'] = new Map();
  let source: CatalogPorts['catalog'] = async () => snapshot('one');
  const readers = createConstructedCardCatalogReaders({
    catalog: format => { state.reads++; return source(format); }, patch: async () => '36.6.3',
    statistics: async () => { state.stats++; return { view: { cards: [] } }; },
    period: id => ({ id, label: id, patch: '36.6.3', timeRange: null }),
    rank: id => ({ id, label: id, rankRange: id }), record: () => { state.history++; },
    cache, jobs, generation: () => state.generation, now: () => state.time,
    ttlMs: 1_000, origin: 'https://source.example.test',
  });
  return { state, cache, jobs, readers, setSource(value: CatalogPorts['catalog']) { source = value; } };
}
function pendingCatalog() {
  let resolve!: (value: ReturnType<typeof snapshot>) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ReturnType<typeof snapshot>>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('warm public identities remain readable while one expired catalog refresh is blocked', async () => {
  const h = catalogHarness();
  const original = await h.readers.loadPublicCards('wild');
  const blocked = pendingCatalog(); h.setSource(() => blocked.promise); h.state.time = 1_000;
  let returned = false;
  const pending = Promise.all(Array.from({ length: 10 }, () => h.readers.loadPublicCards('wild')));
  void pending.then(() => { returned = true; });
  await flush();
  assert.equal(returned, true, 'verified public identities must not wait for upstream revalidation');
  const values = await pending;
  assert.equal(h.state.reads, 2, 'one refresh serves every concurrent reader');
  for (const value of values) {
    assert.equal(value.cards, original.cards);
    assert.equal(value.dataStatus, 'stale'); assert.equal(value.cacheSource, 'LKG');
    assert.equal(value.updatedAt, original.updatedAt); assert.equal(value.datasetVersion, 'one');
  }
  const identity = createConstructedCardReader({ loadCards: h.readers.loadPublicCards,
    loadCardDetail: async () => null, includeDetail: false });
  assert.equal((await identity('wild', 'CARD_1'))?.card_id, 'CARD_1');
  await assert.rejects(identity('wild', 'UNKNOWN_CARD'), /Stale catalog cannot confirm absence/);
  blocked.resolve(snapshot('two', 'CARD_2')); await flush();
  assert.equal((await h.readers.loadPublicCards('wild')).datasetVersion, 'two');
  assert.equal(await identity('wild', 'CARD_1'), null, 'a refreshed removal replaces the old identity');
  assert.equal((await identity('wild', 'CARD_2'))?.card_id, 'CARD_2');
  assert.equal(h.state.stats, 0); assert.equal(h.state.history, 0);
});

test('public refresh failure has a cooldown and cannot extend the stale deadline', async () => {
  const h = catalogHarness(); await h.readers.loadPublicCards('standard');
  h.state.time = 1_000; h.setSource(async () => { throw new Error('source unavailable'); });
  assert.equal((await h.readers.loadPublicCards('standard')).dataStatus, 'stale'); await flush();
  for (let index = 0; index < 10; index++) await h.readers.loadPublicCards('standard');
  assert.equal(h.state.reads, 2, 'failed upstream refreshes do not restart for every page');
  h.state.time = 4_001;
  await assert.rejects(h.readers.loadPublicCards('standard'), /source unavailable/);
  assert.equal(h.state.reads, 2, 'cooldown fails fast once the bounded snapshot expires');
  h.state.time = 31_001; h.setSource(async () => snapshot('recovered'));
  assert.equal((await h.readers.loadPublicCards('standard')).datasetVersion, 'recovered');
  assert.equal(h.state.reads, 3);
});

test('expired full statistics still wait while anonymous identity reuses its snapshot', async () => {
  const h = catalogHarness();
  await h.readers.loadPublicCards('standard'); await h.readers.loadCards('standard');
  h.state.time = 1_000; const blocked = pendingCatalog(); h.setSource(() => blocked.promise);
  let fullReturned = false;
  const full = h.readers.loadCards('standard').then(value => { fullReturned = true; return value; });
  const anonymous = await h.readers.loadPublicCards('standard'); await flush();
  assert.equal(anonymous.dataStatus, 'stale'); assert.equal(fullReturned, false);
  assert.equal(h.state.stats, 1, 'a pending catalog refresh starts no extra statistics read');
  blocked.resolve(snapshot('new')); const value = await full;
  assert.equal(value.datasetVersion, 'new'); assert.equal(h.state.stats, 2);
  assert.equal(anonymous.cards[0].stats, null, 'the public snapshot contains no paid statistics');
});

test('late public refresh completion cannot replace a new generation or install its cooldown', async () => {
  for (const fail of [false, true]) {
    const h = catalogHarness(); await h.readers.loadPublicCards('standard');
    const old = pendingCatalog(); h.state.time = 1_000; h.setSource(() => old.promise);
    await h.readers.loadPublicCards('standard');
    h.state.generation++; h.cache.clear(); h.jobs.clear(); h.setSource(async () => snapshot('new'));
    assert.equal((await h.readers.loadPublicCards('standard')).datasetVersion, 'new');
    if (fail) old.reject(new Error('old generation failed')); else old.resolve(snapshot('old'));
    await flush();
    assert.equal((await h.readers.loadPublicCards('standard')).datasetVersion, 'new');
    h.state.time = 2_000; h.setSource(async () => snapshot('next'));
    await h.readers.loadPublicCards('standard'); await flush();
    assert.equal((await h.readers.loadPublicCards('standard')).datasetVersion, 'next');
  }
});

test('public card catalogs do not start or wait for statistics; paid readers retain isolated statistics and history', async () => {
  let time = 0, generation = 0, statsReads = 0, historyWrites = 0;
  let finish!: (value: Record<string, unknown>) => void;
  let source = new Promise<Record<string, unknown>>(resolve => { finish = resolve; });
  const cache = new Map(), jobs = new Map();
  const readers = createConstructedCardCatalogReaders({
    catalog: async () => ({ document: { cards: [{ card_id: 'CARD_1', dbf: 10, name: { ru: 'Карта' } }], datasetVersion: 'test', verifiedAt: '2026-10-19', publishedAt: '2026-10-18' }, cacheSource: 'fresh', dataStatus: 'fresh', warning: null }),
    patch: async () => '36.6.3',
    statistics: async () => { statsReads++; return source; },
    period: (id, payload) => ({ id, label: id, patch: String(payload.patch), timeRange: null }),
    rank: id => ({ id, label: id, rankRange: id }),
    record: () => { historyWrites++; }, now: () => time, generation: () => generation,
    cache, jobs, ttlMs: 100, origin: 'https://source.example.test',
  });
  const full = readers.loadCards('standard');
  const publicRows = await readers.loadPublicCards('standard');
  assert.equal(statsReads, 1, 'only the full reader starts statistics');
  assert.equal(publicRows.cards[0].stats, null);
  assert.equal(publicRows.updatedAt, '2026-10-18');
  assert.equal(publicRows.period?.patch, '36.6.3');
  assert.equal(historyWrites, 0);
  finish({ fetched_at: '2026-10-19', view: { cards: [{ id: 'CARD_1', dbfId: 10, times_played: 1000, deck_winrate: 53, deck_popularity: 12.5 }] } });
  const paid = await full;
  assert.equal((paid.cards[0].stats as Record<string, unknown>)?.timesPlayed, 1000);
  assert.equal(historyWrites, 1);
  assert.equal(await readers.loadCards('standard'), paid);
  assert.equal(await readers.loadPublicCards('standard'), publicRows);
  assert.equal(statsReads, 1);
  time = 100; source = Promise.reject(new Error('statistics unavailable')); void source.catch(() => {});
  const unavailable = await readers.loadCards('standard');
  assert.match(unavailable.warning ?? '', /Статистика карт временно недоступна/);
  assert.doesNotMatch((await readers.loadPublicCards('standard')).warning ?? '', /Статистика карт временно недоступна/,
    'public identity does not inherit a statistics outage');
  generation++; cache.clear(); jobs.clear();
  await readers.loadPublicCards('wild'); await flush();
  assert.equal(statsReads, 2, 'another public format still starts no statistics');
});

test('HTTP catalog chooses public identity for guests and full statistics for entitled viewers', async () => {
  const row = { card_id: 'CARD_1', dbf: 10, name: { ru: 'Карта' }, class: 'MAGE', card_set: 'CORE',
    card_type: { slug: 'MINION' }, rarity: 'COMMON', collectible: true, mana_cost: 1, mechanics: [] };
  const common = { cards: [row], updatedAt: null, sourceUrl: '', cacheSource: 'fresh' as const,
    dataStatus: 'fresh' as const, partial: false as const, datasetVersion: 'test', catalogVerifiedAt: '', catalogPublishedAt: '' };
  let publicReads = 0, paidReads = 0;
  const app = express();
  app.use('/api', createConstructedCardRouter({
    loadPublicCards: async () => { publicReads++; return common; },
    loadCards: async () => { paidReads++; return { ...common, cards: [{ ...row, stats: { timesPlayed: 1000 } }] }; },
    loadCardDetail: async () => null, loadCardHistory: async () => [],
    getCatalogHealth: () => { throw new Error('unused'); },
    adminGuard: (_request, response) => { response.sendStatus(403); },
    canAccessStats: request => request.headers['x-fixture-access'] === 'allowed',
    setPrivateNoStore: response => { response.set('Cache-Control', 'no-store'); },
  }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/api/constructed-cards?format=standard`;
  try {
    const guest = await fetch(url); const guestBody = await guest.json() as any;
    assert.equal(guest.status, 200); assert.equal(guestBody.statsAccess, false);
    assert.deepEqual([publicReads, paidReads], [1, 0]);
    const paid = await fetch(url, { headers: { 'X-Fixture-Access': 'allowed' } });
    const paidBody = await paid.json() as any;
    assert.equal(paid.status, 200); assert.equal(paidBody.statsAccess, true);
    assert.equal(paidBody.cards[0].stats.timesPlayed, 1000);
    assert.deepEqual([publicReads, paidReads], [1, 1]);
    assert.equal(guest.headers.get('cache-control'), 'no-store');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
