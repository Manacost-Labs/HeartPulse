import assert from 'node:assert/strict';
import express from 'express';
import {
  createPublicApiRouter,
  type ApiKeyManager,
  type PublicDeckStatisticsSource,
} from '../server/modules/publicApi/public.js';

const calls: string[] = [];
let failLoads = false;

const deckStatistics: PublicDeckStatisticsSource = {
  loadCatalog: async format => {
    calls.push(`catalog:${format}`);
    if (failLoads) throw new Error('PRIVATE_DECK_PROVIDER_FAILURE');
    return {
      format,
      formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт',
      patch: '36.0.3',
      minimumGames: 50,
      updatedAt: '2026-07-30T10:05:00.000Z',
      coverage: { privateCoverage: true },
      items: [
        {
          slug: 'thief-priest',
          archetype: 'Thief Priest',
          archetypeLabel: 'Воровской Жрец',
          translated: true,
          classKey: 'priest',
          format,
          games: 31_959,
          winrate: 58.3,
          popularity: 13.5,
          turns: 7.9,
          durationMinutes: 8,
          climbingSpeed: 1.24,
          deckCount: 2,
          sourceUrl: 'https://provider.example/private-archetype',
          builds: [
            {
              deckCode: 'PRIVATE_DECK_CODE_A',
              games: 2_216,
              winrate: 57.1,
              sourceUrl: 'https://provider.example/private-deck-a',
              updatedAt: '2026-07-30T10:05:00.000Z',
              classKey: 'priest',
              sampleRank: 'all',
              samplePeriod: 'past_30_days',
            },
            {
              deckCode: 'PRIVATE_DECK_CODE_B',
              games: 980,
              winrate: 55.4,
              sourceUrl: 'https://provider.example/private-deck-b',
              updatedAt: '2026-07-30T09:05:00.000Z',
              classKey: 'priest',
              sampleRank: 'legend',
              samplePeriod: 'past_7_days',
            },
          ],
        },
        {
          slug: 'tempo-mage',
          archetype: 'Tempo Mage',
          archetypeLabel: 'Темпо Маг',
          translated: true,
          classKey: 'mage',
          format,
          games: 18_404,
          winrate: 52.4,
          popularity: 7.8,
          turns: 7.2,
          durationMinutes: 7.8,
          climbingSpeed: 0.84,
          deckCount: 1,
          sourceUrl: 'https://provider.example/private-archetype-2',
          builds: [{
            deckCode: 'PRIVATE_DECK_CODE_C',
            games: 1_100,
            winrate: 53.2,
            sourceUrl: 'https://provider.example/private-deck-c',
            updatedAt: '2026-07-30T08:05:00.000Z',
            classKey: 'mage',
            sampleRank: 'diamond',
            samplePeriod: 'past_7_days',
          }],
        },
      ],
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
        name: 'Statistics integration',
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
app.use('/api/v1', createPublicApiRouter({ apiKeys, deckStatistics }));
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
  const unauthenticated = await fetch(`${origin}/deck-statistics`);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(calls, [], 'authentication must run before loading deck statistics');

  const firstPage = await fetch(`${origin}/deck-statistics?limit=2`, { headers });
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.headers.get('cache-control'), 'private, max-age=60');
  assert.match(String(firstPage.headers.get('etag')), /^"/);
  const firstPayload = await firstPage.json() as Record<string, any>;
  assert.equal(firstPayload.meta.format, 'standard');
  assert.equal(firstPayload.data.length, 2);
  assert.equal(firstPayload.data[0].metrics.games, 2_216);
  assert.equal(firstPayload.data[0].metrics.winratePercent, 57.1);
  assert.equal(firstPayload.data[0].archetype.slug, 'thief-priest');
  assert.match(firstPayload.data[0].deckId, /^deck_[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(firstPayload).includes('PRIVATE_DECK_CODE'), false);
  assert.equal(JSON.stringify(firstPayload).includes('provider.example'), false);
  assert.equal(firstPayload.pagination.hasMore, true);
  assert.match(firstPayload.pagination.nextCursor, /^[A-Za-z0-9_-]+$/);

  const secondPage = await fetch(
    `${origin}/deck-statistics?limit=2&cursor=${firstPayload.pagination.nextCursor}`,
    { headers },
  );
  assert.equal(secondPage.status, 200);
  const secondPayload = await secondPage.json() as Record<string, any>;
  assert.equal(secondPayload.data.length, 1);
  assert.equal(secondPayload.data[0].archetype.slug, 'thief-priest');

  const filtered = await fetch(
    `${origin}/deck-statistics?format=wild&archetype=tempo-mage&minGames=1000`,
    { headers },
  );
  assert.equal(filtered.status, 200);
  const filteredPayload = await filtered.json() as Record<string, any>;
  assert.equal(filteredPayload.data.length, 1);
  assert.equal(filteredPayload.data[0].archetype.slug, 'tempo-mage');
  assert.ok(calls.includes('catalog:wild'));

  const deckId = firstPayload.data[0].deckId;
  const detail = await fetch(
    `${origin}/decks/${deckId}/statistics?format=standard`,
    { headers },
  );
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json() as Record<string, any>;
  assert.equal(detailPayload.data.deckId, deckId);
  assert.equal(JSON.stringify(detailPayload).includes('PRIVATE_'), false);

  for (const query of [
    '?format=classic',
    '?archetype=../private',
    '?minGames=-1',
    '?limit=501',
  ]) {
    const invalid = await fetch(`${origin}/deck-statistics${query}`, { headers });
    assert.equal(invalid.status, 400, query);
  }

  const missing = await fetch(
    `${origin}/decks/deck_00000000000000000000000000000000/statistics`,
    { headers },
  );
  assert.equal(missing.status, 404);

  failLoads = true;
  const unavailable = await fetch(`${origin}/deck-statistics`, { headers });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: {
      code: 'DECK_STATISTICS_UNAVAILABLE',
      message: 'Deck statistics are temporarily unavailable',
    },
  });
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('public API deck statistics contract tests passed');
