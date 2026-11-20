import assert from 'node:assert/strict';
import express from 'express';
import { encode } from '@firestone-hs/deckstrings';
import { createConstructedArchetypeRouter, type ConstructedArchetypeRouterDependencies } from '../server/constructedArchetypeRoutes.js';
import { PUBLIC_ARCHETYPE_BUILDS_LIMIT, projectPublicArchetype } from '../server/publicArchetypeSlice.js';
import { publicDeckCards, publicDeckCatalog } from '../server/publicDeckCards.js';

/**
 * Sentinel for the open archetype layer: every paid field of the fixture
 * carries a unique label, and none of them may reach
 * `/api/constructed-archetypes/public/:format/:slug`.
 */
const PAID_LABELS = ['7.1717', '6.2626', 'SENTINEL_HISTORY', 'SENTINEL_MATCHUP', '61.6161', 'SENTINEL_RANK', 'SENTINEL_BUILD_FIELD', 'SENTINEL_ITEM_FIELD'];
export function assertNoPaidLabels(body: string): void {
  for (const label of PAID_LABELS) assert.ok(!body.includes(label), `paid label ${label} reached a guest`);
}

const cardRows = Array.from({ length: 16 }, (_, index) => ({
  card_id: `SENT_${index}`, dbf: 1000 + index, name: { ru: `Карта ${index}`, en: `Card ${index}` },
  mana_cost: index % 8, rarity: index === 0 ? 'LEGENDARY' : 'COMMON',
}));
const code = encode({
  heroes: [7], format: 2,
  cards: cardRows.slice(0, 15).map((card, index) => [card.dbf, index === 0 ? 1 : 2] as [number, number]),
});

const builds = Array.from({ length: 14 }, (_, index) => ({
  deckCode: code, games: 5_000 - index * 100, winrate: 55 - index / 10, sourceUrl: 'https://www.hsguru.com/deck/1',
  updatedAt: '2026-11-19T08:00:00.000Z', classKey: 'mage' as const, sampleRank: 'all', samplePeriod: 'past_7_days',
  sampleSource: 'stats' as const, privateField: 'SENTINEL_BUILD_FIELD',
}));
const catalog = {
  format: 'standard' as const, formatLabel: 'Стандарт', patch: '37.0.2', period: 'patch_37.0.2', availablePeriods: ['patch_37.0.2'],
  minimumGames: 10, updatedAt: '2026-11-19T08:00:00.000Z', coverage: { secret: 'SENTINEL_ITEM_FIELD' },
  items: [{
    slug: 'sentinel-mage', archetype: 'Sentinel Mage', archetypeLabel: 'Страж-маг', translated: true, classKey: 'mage' as const,
    format: 'standard' as const, games: 12_345, winrate: 54.4, popularity: 6.5, turns: 7.2, durationMinutes: 8.1, climbingSpeed: 1.1,
    deckCount: 14, sourceUrl: 'https://www.hsguru.com/meta', builds, privateField: 'SENTINEL_ITEM_FIELD',
  }],
};

let cardsAvailable = true;
let catalogAvailable = true;
let catalogReads = 0, paidReads = 0, now = 1_000_000;
const dependencies: ConstructedArchetypeRouterDependencies = {
  accessGuard: (_request, response) => { response.status(403).json({ error: 'paid' }); },
  setPrivateNoStore: response => { response.set('Cache-Control', 'no-store'); },
  loadCatalog: async () => { catalogReads++; if (!catalogAvailable) throw new Error('catalog down'); return catalog; },
  loadCardCatalog: async () => { if (!cardsAvailable) throw new Error('cards down'); return { cards: cardRows }; },
  loadHistory: async () => { paidReads++; return [{ recordedAt: 'SENTINEL_HISTORY', games: 1, winrate: null, popularity: null, turns: null, durationMinutes: null, climbingSpeed: null }]; },
  loadAnalysis: async () => {
    paidReads++;
    return {
      rank: 'legend', period: 'past_week', state: 'ok', updatedAt: null, matchupsUpdatedAt: null, cardStatsUpdatedAt: null,
      sourceUrls: { matchups: '', cards: '' },
      classMatchups: [{ classKey: 'mage', classLabel: 'SENTINEL_MATCHUP', winrate: 61.6161, games: 5, share: null }],
      cardStats: [{ cardId: 'X', dbfId: 1, cardName: 'X', cost: 1, mulliganImpact: 7.1717, mulliganCount: 1, drawnImpact: null, drawnCount: null, keptImpact: 6.2626, keptCount: 1, tile: null, artwork: null, fullArtwork: null, rarity: null }],
    };
  },
  loadRanks: async () => { paidReads++; return { updatedAt: 'SENTINEL_RANK' } as never; },
};

const realNow = Date.now;
Date.now = () => now;
const app = express();
app.use('/api', createConstructedArchetypeRouter(dependencies));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/constructed-archetypes/public`;

try {
  const response = await fetch(`${origin}/standard/sentinel-mage`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /^public, max-age=300/);
  const etag = response.headers.get('etag');
  assert.ok(etag);
  const text = await response.text();
  assertNoPaidLabels(text);
  assert.equal(paidReads, 0, 'the open route never reads the paid sources');
  const body = JSON.parse(text);
  assert.equal(body.item.builds.length, PUBLIC_ARCHETYPE_BUILDS_LIMIT);
  assert.equal(body.item.deckCount, 14, 'the total stays, the list is the first builds');
  assert.equal(body.item.builds[0].deckCode, code, 'the deck code is open');
  assert.equal(body.item.builds[0].cards.length, 15);
  assert.deepEqual(body.item.builds[0].cards[0], { dbfId: 1000, name: 'Карта 0', cost: 0, rarity: 'LEGENDARY', count: 1 });
  assert.deepEqual(Object.keys(body.item.builds[0]).sort(), ['cards', 'deckCode', 'games', 'samplePeriod', 'sampleRank', 'updatedAt', 'winrate']);
  assert.deepEqual([body.history, body.analysis], [[], null]);
  assert.equal(body.item.turns, 7.2, 'pace is part of the general slice');

  // The same answer revalidates with its ETag.
  assert.equal((await fetch(`${origin}/standard/sentinel-mage`, { headers: { 'If-None-Match': etag } })).status, 304);
  assert.equal(catalogReads, 1, 'a fresh copy answers without the source');

  // Mutation: a projection that spreads the source row (or adds the analysis) must turn this check red.
  const leaky = { ...body, item: { ...catalog.items[0] }, analysis: await dependencies.loadAnalysis('standard', 'Sentinel Mage') };
  assert.throws(() => assertNoPaidLabels(JSON.stringify(leaky)), /paid label/);
  const projected = projectPublicArchetype(catalog, catalog.items[0], publicDeckCatalog(cardRows));
  assertNoPaidLabels(JSON.stringify(projected));

  // Outage: the last good copy answers (stale), then 503 with Retry-After, never an empty answer.
  now += 301_000;
  catalogAvailable = false;
  let stale = await fetch(`${origin}/standard/sentinel-mage`);
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('x-data-cache'), 'memory-stale');
  assert.equal((await stale.json() as any).warning, 'stale');
  now += 7 * 3_600_000;
  const down = await fetch(`${origin}/standard/sentinel-mage`);
  assert.equal(down.status, 503);
  assert.equal(down.headers.get('retry-after'), '60');
  assert.equal((await fetch(`${origin}/standard/never-seen`)).status, 503, 'no copy and no source: 503, not 502');

  // A deck the card catalog cannot name is a failed read, not a half list.
  catalogAvailable = true;
  cardsAvailable = false;
  assert.equal((await fetch(`${origin}/standard/sentinel-mage`)).status, 503);
  cardsAvailable = true;
  assert.equal((await fetch(`${origin}/standard/nobody`)).status, 404);
  assert.equal((await fetch(`${origin}/classic/sentinel-mage`)).status, 400);
  assert.equal((await fetch(`${origin}/standard/BAD_SLUG!`)).status, 400);

  // The card list rules.
  const index = publicDeckCatalog(cardRows);
  assert.equal(publicDeckCards('not-a-code', index), null);
  assert.equal(publicDeckCards(code, new Map()), null, 'a card missing from the catalog fails the whole list');
} finally {
  Date.now = realNow;
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}
