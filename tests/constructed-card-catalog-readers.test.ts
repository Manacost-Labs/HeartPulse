import express from 'express';
import { once } from 'node:events';
import { createConstructedCardRouter } from '../server/constructedCardRoutes.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { createConstructedCardCatalogReaders } from '../server/modules/constructedCards/public.js';

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
  assert.equal((await readers.loadPublicCards('standard')).warning, null, 'public identity does not inherit a statistics outage');
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
