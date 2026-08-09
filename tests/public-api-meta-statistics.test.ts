import assert from 'node:assert/strict';
import express from 'express';
import {
  createPublicApiRouter,
  type ApiKeyManager,
  type PublicMetaStatisticsSource,
} from '../server/modules/publicApi/public.js';

const calls: string[] = [];
let failLoads = false;

const metaStatistics: PublicMetaStatisticsSource = {
  loadMeta: async (
    format: string,
    rank: string,
    period: string,
    coin: string,
    minGames: number,
  ) => {
    calls.push(`meta:${format}:${rank}:${period}:${coin}:${minGames}`);
    if (failLoads) throw new Error('PRIVATE_META_PROVIDER_FAILURE');
    return {
      publicationMode: 'stable',
      publishedAt: '2026-07-30T10:00:00.000Z',
      format,
      formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт',
      rank,
      rankLabel: 'Легенда',
      period,
      availablePeriods: ['past_day', 'past_3_days', 'past_week', 'past_2_weeks', 'patch_36.0.3'],
      currentPatchPeriod: 'patch_36.0.3',
      coin,
      minGames,
      source: 'private-provider',
      sourceId: 'private-source-id',
      sourceUrl: 'https://provider.example/private-meta',
      translationSource: 'private-translations',
      updatedAt: '2026-07-30T10:00:00.000Z',
      items: [
        {
          id: 'arch-2',
          slug: 'tempo-mage',
          archetype: 'Tempo Mage',
          archetypeLabel: 'Темпо Маг',
          translated: true,
          classKey: 'mage',
          winrate: 52.4,
          popularity: 7.8,
          games: 18_404,
          turns: 7.2,
          durationMinutes: 7.8,
          climbingSpeed: 0.84,
          privateMetric: 'PRIVATE_META_ITEM',
        },
        {
          id: 'arch-1',
          slug: 'thief-priest',
          archetype: 'Thief Priest',
          archetypeLabel: 'Воровской Жрец',
          translated: true,
          classKey: 'priest',
          winrate: 58.3,
          popularity: 13.5,
          games: 31_959,
          turns: 7.9,
          durationMinutes: 8,
          climbingSpeed: 1.24,
        },
      ],
    };
  },
  loadCatalog: async format => {
    calls.push(`catalog:${format}`);
    return {
      format,
      formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт',
      patch: '36.0.3',
      minimumGames: 50,
      updatedAt: '2026-07-30T10:05:00.000Z',
      coverage: { privateCoverage: true },
      items: [{
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
        builds: [{
          deckCode: 'PRIVATE_DECK_CODE',
          games: 2_216,
          winrate: 57.1,
          sourceUrl: 'https://provider.example/private-deck',
          updatedAt: '2026-07-30T10:05:00.000Z',
          classKey: 'priest',
          sampleRank: 'all',
          samplePeriod: 'past_30_days',
        }],
      }],
    };
  },
  loadHistory: async (format: string, archetype: string) => {
    calls.push(`history:${format}:${archetype}`);
    return [
      {
        recordedAt: '2026-07-28T10:05:00.000Z',
        games: 29_000,
        winrate: 57.8,
        popularity: 12.9,
        turns: 8.1,
        durationMinutes: 8.2,
        climbingSpeed: 1.1,
        privatePoint: 'PRIVATE_HISTORY',
      },
      {
        recordedAt: '2026-07-30T10:05:00.000Z',
        games: 31_959,
        winrate: 58.3,
        popularity: 13.5,
        turns: 7.9,
        durationMinutes: 8,
        climbingSpeed: 1.24,
      },
    ];
  },
  loadAnalysis: async (format: string, archetype: string) => {
    calls.push(`analysis:${format}:${archetype}`);
    return {
      rank: 'legend',
      period: 'past_week',
      state: 'ok',
      updatedAt: '2026-07-30T10:10:00.000Z',
      matchupsUpdatedAt: '2026-07-30T10:09:00.000Z',
      cardStatsUpdatedAt: '2026-07-30T10:08:00.000Z',
      sourceUrls: {
        matchups: 'https://provider.example/private-matchups',
        cards: 'https://provider.example/private-cards',
      },
      classMatchups: [{
        classKey: 'mage',
        classLabel: 'Маг',
        winrate: 54.2,
        games: 320,
        share: 12.4,
      }],
      cardStats: [{
        cardId: 'TOY_330',
        dbfId: 123,
        cardName: 'Гость из Бездны',
        cost: 3,
        mulliganImpact: 4.8,
        mulliganCount: 1_250,
        drawnImpact: -1.2,
        drawnCount: 980,
        keptImpact: 6.1,
        keptCount: 740,
      }],
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
app.use('/api/v1', createPublicApiRouter({
  apiKeys,
  metaStatistics,
  publicOrigin: 'https://arena.hs-manacost.ru/',
}));
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
  const unauthenticated = await fetch(`${origin}/meta-statistics`);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(calls, [], 'authentication must run before loading meta statistics');

  const firstPage = await fetch(`${origin}/meta-statistics?limit=1`, { headers });
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.headers.get('cache-control'), 'private, max-age=60');
  assert.match(String(firstPage.headers.get('etag')), /^"/);
  const firstPayload = await firstPage.json() as Record<string, any>;
  assert.equal(firstPayload.meta.format, 'standard');
  assert.equal(firstPayload.meta.rank.id, 'legend');
  assert.equal(firstPayload.meta.period.id, '1d');
  assert.equal(firstPayload.data[0].slug, 'thief-priest');
  assert.deepEqual(firstPayload.data[0].links, {
    web: 'https://arena.hs-manacost.ru/standard/archetypes/standard/thief-priest',
    statistics: 'https://arena.hs-manacost.ru/api/v1/archetypes/thief-priest/statistics?format=standard',
    history: 'https://arena.hs-manacost.ru/api/v1/archetypes/thief-priest/statistics/history?format=standard',
    analysis: 'https://arena.hs-manacost.ru/api/v1/archetypes/thief-priest/analysis?format=standard',
    builds: 'https://arena.hs-manacost.ru/api/v1/deck-statistics?format=standard&archetype=thief-priest',
  });
  assert.deepEqual(firstPayload.data[0].metrics, {
    winratePercent: 58.3,
    popularityPercent: 13.5,
    games: 31_959,
    averageTurns: 7.9,
    averageDurationMinutes: 8,
    climbingSpeedStarsPerHour: 1.24,
  });
  assert.equal(JSON.stringify(firstPayload).includes('PRIVATE_'), false);
  assert.equal(JSON.stringify(firstPayload).includes('provider.example'), false);
  assert.equal(firstPayload.pagination.hasMore, true);
  assert.match(firstPayload.pagination.nextCursor, /^[A-Za-z0-9_-]+$/);

  const secondPage = await fetch(
    `${origin}/meta-statistics?limit=1&cursor=${firstPayload.pagination.nextCursor}`,
    { headers },
  );
  assert.equal(secondPage.status, 200);
  assert.equal((await secondPage.json() as Record<string, any>).data[0].slug, 'tempo-mage');

  const selectedSlice = await fetch(
    `${origin}/meta-statistics?format=wild&rank=top_1000&period=patch&minGames=500`,
    { headers },
  );
  assert.equal(selectedSlice.status, 200);
  assert.ok(calls.includes('meta:wild:top_legend:patch_36.0.3:any_player:500'));

  for (const query of [
    '?format=classic',
    '?rank=gold',
    '?rank=diamond',
    '?rank=top_500',
    '?rank=top_100',
    '?period=30d',
    '?minGames=42',
    '?limit=501',
  ]) {
    const invalid = await fetch(`${origin}/meta-statistics${query}`, { headers });
    assert.equal(invalid.status, 400, query);
  }

  const detail = await fetch(
    `${origin}/archetypes/thief-priest/statistics?format=wild`,
    { headers },
  );
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json() as Record<string, any>;
  assert.equal(detailPayload.data.slug, 'thief-priest');
  assert.equal(detailPayload.data.deckCount, 2);
  assert.equal(
    detailPayload.data.links.web,
    'https://arena.hs-manacost.ru/standard/archetypes/wild/thief-priest',
  );
  assert.equal(
    detailPayload.data.links.builds,
    'https://arena.hs-manacost.ru/api/v1/deck-statistics?format=wild&archetype=thief-priest',
  );
  assert.equal(JSON.stringify(detailPayload).includes('PRIVATE_DECK_CODE'), false);

  const history = await fetch(
    `${origin}/archetypes/thief-priest/statistics/history?format=wild&days=30`,
    { headers },
  );
  assert.equal(history.status, 200);
  const historyPayload = await history.json() as Record<string, any>;
  assert.equal(historyPayload.meta.days, 30);
  assert.equal(historyPayload.data.length, 2);
  assert.equal(historyPayload.data[0].recordedAt, '2026-07-28T10:05:00.000Z');
  assert.equal(JSON.stringify(historyPayload).includes('PRIVATE_HISTORY'), false);

  const analysis = await fetch(
    `${origin}/archetypes/thief-priest/analysis?format=wild`,
    { headers },
  );
  assert.equal(analysis.status, 200);
  const analysisPayload = await analysis.json() as Record<string, any>;
  assert.equal(analysisPayload.data.classMatchups[0].metrics.winratePercent, 54.2);
  assert.equal(analysisPayload.data.cardStatistics[0].metrics.mulliganImpactPercentagePoints, 4.8);
  assert.equal(JSON.stringify(analysisPayload).includes('sourceUrls'), false);
  assert.equal(JSON.stringify(analysisPayload).includes('provider.example'), false);

  const missing = await fetch(
    `${origin}/archetypes/missing/statistics?format=wild`,
    { headers },
  );
  assert.equal(missing.status, 404);

  failLoads = true;
  const unavailable = await fetch(`${origin}/meta-statistics`, { headers });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: {
      code: 'META_STATISTICS_UNAVAILABLE',
      message: 'Meta statistics are temporarily unavailable',
    },
  });
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('public API meta statistics contract tests passed');
