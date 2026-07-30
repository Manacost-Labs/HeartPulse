import assert from 'node:assert/strict';
import express from 'express';
import {
  createPublicApiRouter,
  type ApiKeyManager,
  type PublicArenaStatisticsSource,
} from '../server/modules/publicApi/public.js';

const calls: string[] = [];
let failLoads = false;

const arenaStatistics: PublicArenaStatisticsSource = {
  loadClasses: async source => {
    calls.push(`classes:${source}`);
    if (failLoads) throw new Error('PRIVATE_ARENA_PROVIDER_FAILURE');
    return {
      classes: [
        {
          id: 'mage',
          name: 'Маг',
          winrate: 54.8,
          games: 12_345,
          color: '#2b5c85',
          privateField: 'must not leak',
        },
        { id: 'rogue', name: 'Разбойник', winrate: 51.2, games: 9_876 },
      ],
      updatedAt: '2026-07-30T11:00:00.000Z',
      source: 'private-provider.example',
    };
  },
  loadCards: async source => {
    calls.push(`cards:${source}`);
    if (failLoads) throw new Error('PRIVATE_ARENA_PROVIDER_FAILURE');
    return {
      sections: [
        {
          id: 'mage',
          tiers: [
            {
              tier: 'S',
              cards: [
                {
                  cardId: 'TEST_001',
                  name: 'Первая карта',
                  rarity: 'RARE',
                  classKey: 'mage',
                  deckWinrate: 58.4,
                  playedWinrate: 61.2,
                  pickRate: 28.1,
                  inDecks: 42.5,
                  totalGames: 15_000,
                  arenaScore: 132,
                  offerRate: 18.7,
                  discardRate: 4.2,
                  drawnWinrate: 59.1,
                  mulliganWinrate: 55.4,
                  keptRate: 72.2,
                  avgCopies: 1.34,
                  imageHa: 'https://private-provider.example/card.png',
                },
              ],
            },
          ],
        },
        {
          id: 'rogue',
          tiers: [{
            tier: 'A',
            cards: [{
              cardId: 'TEST_002',
              name: 'Вторая карта',
              classKey: 'rogue',
              totalGames: 900,
              deckWinrate: 51.5,
            }],
          }],
        },
      ],
      updatedAt: '2026-07-30T11:00:00.000Z',
      source: 'private-provider.example',
      privatePayload: true,
    };
  },
  loadLegendaries: async source => {
    calls.push(`legendaries:${source}`);
    if (failLoads) throw new Error('PRIVATE_ARENA_PROVIDER_FAILURE');
    return {
      groups: [{
        keyCard: {
          cardId: 'LEG_001',
          name: 'Легендарная карта',
          classKey: 'mage',
          totalGames: 3_000,
          deckWinrate: 57.3,
          pickRate: 33.4,
          offerRate: 9.1,
          arenaScore: 126,
          imageRu: 'https://private-provider.example/legendary.png',
        },
        cards: [
          { cardId: 'TOKEN_001' },
          { cardId: 'TOKEN_002' },
        ],
        winRate: 57.3,
        pickRate: 33.4,
        offerRate: 9.1,
        score: 126,
        classKey: 'mage',
        sourceUrl: 'https://private-provider.example/report',
      }],
      updatedAt: '2026-07-30T11:00:00.000Z',
      source: 'private-provider.example',
    };
  },
  loadMatchups: async () => {
    calls.push('matchups');
    if (failLoads) throw new Error('PRIVATE_ARENA_PROVIDER_FAILURE');
    return {
      matchups: [
        {
          classAId: 'mage',
          classBId: 'rogue',
          winrate: 53.2,
          classA: 'PRIVATE_MAGE_LABEL',
          classB: 'PRIVATE_ROGUE_LABEL',
        },
        { classAId: 'rogue', classBId: 'mage', winrate: 46.8 },
      ],
      updatedAt: '2026-07-30T11:00:00.000Z',
      source: 'private-provider.example',
    };
  },
};

const apiKeys: ApiKeyManager = {
  create: () => { throw new Error('not used'); },
  list: () => [],
  revoke: () => null,
  authenticate: (key, requiredScope) => {
    if (key === 'statistics-key' && requiredScope === 'statistics.read') {
      return {
        id: 'api_key_statistics',
        name: 'Arena statistics integration',
        prefix: 'mca_live_statistics',
        scopes: ['statistics.read'],
        createdAt: '2026-07-30T10:00:00.000Z',
        createdBy: 'admin-1',
        lastUsedAt: '2026-07-30T10:00:00.000Z',
        revokedAt: null,
        status: 'ACTIVE',
      };
    }
    return key ? 'FORBIDDEN' : null;
  },
};

const app = express();
app.use('/api/v1', createPublicApiRouter({ apiKeys, arenaStatistics }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/v1`;
const headers = { 'X-API-Key': 'statistics-key' };

try {
  const unauthenticated = await fetch(`${origin}/arena/statistics/classes`);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(calls, [], 'authentication must run before loading Arena statistics');

  const classes = await fetch(`${origin}/arena/statistics/classes?source=firestone`, { headers });
  assert.equal(classes.status, 200);
  const classesPayload = await classes.json() as Record<string, any>;
  assert.equal(classesPayload.meta.source, 'firestone');
  assert.equal(classesPayload.data[0].classId, 'mage');
  assert.equal(classesPayload.data[0].rank, 1);
  assert.equal(classesPayload.data[0].metrics.winratePercent, 54.8);
  assert.equal(classesPayload.data[0].metrics.games, 12_345);
  assert.equal(JSON.stringify(classesPayload).includes('privateField'), false);
  assert.equal(JSON.stringify(classesPayload).includes('private-provider'), false);

  const cards = await fetch(
    `${origin}/arena/statistics/cards?source=hsreplay&class=mage&tier=S&minGames=1000`,
    { headers },
  );
  assert.equal(cards.status, 200);
  const cardsPayload = await cards.json() as Record<string, any>;
  assert.equal(cardsPayload.data.length, 1);
  assert.equal(cardsPayload.data[0].cardId, 'TEST_001');
  assert.equal(cardsPayload.data[0].metrics.deckWinratePercent, 58.4);
  assert.equal(cardsPayload.data[0].metrics.playedWinratePercent, 61.2);
  assert.equal(cardsPayload.data[0].metrics.games, 15_000);
  assert.equal(JSON.stringify(cardsPayload).includes('imageHa'), false);
  assert.equal(JSON.stringify(cardsPayload).includes('private-provider'), false);

  const legendaries = await fetch(
    `${origin}/arena/statistics/legendaries?class=mage&minGames=1000`,
    { headers },
  );
  assert.equal(legendaries.status, 200);
  const legendariesPayload = await legendaries.json() as Record<string, any>;
  assert.equal(legendariesPayload.data[0].cardId, 'LEG_001');
  assert.deepEqual(legendariesPayload.data[0].relatedCardIds, ['TOKEN_001', 'TOKEN_002']);
  assert.equal(legendariesPayload.data[0].metrics.winratePercent, 57.3);
  assert.equal(JSON.stringify(legendariesPayload).includes('sourceUrl'), false);

  const matchups = await fetch(
    `${origin}/arena/statistics/matchups?class=mage`,
    { headers },
  );
  assert.equal(matchups.status, 200);
  const matchupsPayload = await matchups.json() as Record<string, any>;
  assert.equal(matchupsPayload.data.length, 2);
  assert.equal(matchupsPayload.data[0].metrics.winratePercent, 53.2);
  assert.equal(JSON.stringify(matchupsPayload).includes('PRIVATE_'), false);

  for (const path of [
    '/arena/statistics/classes?source=unknown',
    '/arena/statistics/cards?class=../private',
    '/arena/statistics/cards?tier=Z',
    '/arena/statistics/cards?minGames=-1',
    '/arena/statistics/cards?limit=501',
    '/arena/statistics/matchups?class=unknown-class',
  ]) {
    const invalid = await fetch(`${origin}${path}`, { headers });
    assert.equal(invalid.status, 400, path);
  }

  failLoads = true;
  const unavailable = await fetch(`${origin}/arena/statistics/classes`, { headers });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: {
      code: 'ARENA_STATISTICS_UNAVAILABLE',
      message: 'Arena statistics are temporarily unavailable',
    },
  });
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('public API Arena statistics contract tests passed');
