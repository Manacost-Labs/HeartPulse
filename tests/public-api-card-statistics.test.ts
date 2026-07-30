import assert from 'node:assert/strict';
import express from 'express';
import {
  createPublicApiRouter,
  type ApiKeyManager,
} from '../server/modules/publicApi/public.js';

type QuerySlice = {
  format: string;
  period: string;
  rank: string;
};

const calls: string[] = [];
let failLoads = false;
const cards = [
  {
    card_id: 'CARD_2',
    privateProviderPayload: 'PRIVATE_SECOND',
    stats: null,
  },
  {
    card_id: 'CARD_1',
    statsSourceUrl: 'https://provider.example/private',
    stats: {
      deckPopularity: 12.5,
      deckWinrate: 54.3,
      averageCopies: 1.4,
      timesPlayed: 240,
      winrateWhenPlayed: 57.2,
      winrateWhenDrawn: 55.1,
      keepPercentage: 43.2,
      openingHandWinrate: 52.4,
      averageTurnsInHand: 2.8,
      averageTurnPlayed: 4.1,
      privateMetric: 'PRIVATE_METRIC',
    },
  },
];

const cardStatistics = {
  loadCards: async (format: string, period: string, rank: string) => {
    calls.push(`list:${format}:${period}:${rank}`);
    if (failLoads) throw new Error('PRIVATE_UPSTREAM_STATISTICS_FAILURE');
    return {
      cards,
      updatedAt: '2026-07-30T10:25:00.000Z',
      sourceUrl: 'https://provider.example/private',
      cacheSource: 'fresh' as const,
      dataStatus: 'fresh' as const,
      datasetVersion: `statistics-${format}-${rank}-${period}-v1`,
      catalogPublishedAt: '2026-07-30T10:25:00.000Z',
      period: {
        id: period,
        label: 'Provider label',
        timeRange: period === 'patch' ? null : 'LAST_1_DAY',
        patch: period === 'patch' ? '36.0.3' : null,
      },
      rank: {
        id: rank,
        label: 'Provider rank',
        rankRange: rank === 'platinum' ? 'PLATINUM' : 'LEGEND',
      },
    };
  },
  loadCardHistory: async (
    format: string,
    cardId: string,
    period: string,
    rank: string,
    days: number,
  ) => {
    calls.push(`history:${format}:${cardId}:${period}:${rank}:${days}`);
    return [{
      recordedAt: '2026-07-29T10:25:00.000Z',
      deckPopularity: 11.8,
      deckWinrate: 53.7,
      averageCopies: 1.3,
      timesPlayed: 221,
      winrateWhenPlayed: 56.9,
      winrateWhenDrawn: 54.8,
      keepPercentage: 42.1,
      openingHandWinrate: 51.9,
      averageTurnsInHand: 2.9,
      averageTurnPlayed: 4.2,
      privateHistory: 'PRIVATE_HISTORY',
    }];
  },
};

const apiKeys: ApiKeyManager = {
  create: () => { throw new Error('not used'); },
  list: () => [],
  revoke: () => null,
  authenticate: (key, requiredScope) => {
    if (key === 'statistics-key') {
      return requiredScope === 'statistics.read'
        ? {
          id: 'api_key_statistics',
          name: 'Statistics integration',
          prefix: 'mca_live_statistics',
          scopes: ['statistics.read'],
          createdAt: '2026-07-30T10:00:00.000Z',
          createdBy: 'admin-1',
          lastUsedAt: '2026-07-30T10:00:00.000Z',
          revokedAt: null,
          status: 'ACTIVE',
        }
        : 'FORBIDDEN';
    }
    return key === 'catalog-only-key' ? 'FORBIDDEN' : null;
  },
};

const app = express();
app.use('/api/v1', createPublicApiRouter({
  apiKeys,
  cardStatistics,
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

function querySlice(payload: Record<string, any>): QuerySlice {
  return {
    format: payload.meta.format,
    period: payload.meta.period.id,
    rank: payload.meta.rank.id,
  };
}

try {
  const unauthenticated = await fetch(`${origin}/card-statistics`);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(calls, [], 'authentication must run before statistics loading');

  const forbidden = await fetch(`${origin}/card-statistics`, {
    headers: { 'X-API-Key': 'catalog-only-key' },
  });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(calls, []);

  const firstPage = await fetch(`${origin}/card-statistics?limit=1`, { headers });
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.headers.get('cache-control'), 'private, max-age=60');
  assert.equal(firstPage.headers.get('x-dataset-version'), 'statistics-standard-legend-1d-v1');
  assert.match(String(firstPage.headers.get('etag')), /^"/);
  const firstPayload = await firstPage.json() as Record<string, any>;
  assert.deepEqual(querySlice(firstPayload), {
    format: 'standard',
    period: '1d',
    rank: 'legend',
  });
  assert.deepEqual(firstPayload.data, [{
    cardId: 'CARD_1',
    metrics: {
      deckPopularityPercent: 12.5,
      deckWinratePercent: 54.3,
      averageCopies: 1.4,
      timesPlayed: 240,
      winrateWhenPlayedPercent: 57.2,
      winrateWhenDrawnPercent: 55.1,
      keepPercentage: 43.2,
      openingHandWinratePercent: 52.4,
      averageTurnsInHand: 2.8,
      averageTurnPlayed: 4.1,
    },
  }]);
  assert.equal(JSON.stringify(firstPayload).includes('PRIVATE_'), false);
  assert.equal(JSON.stringify(firstPayload).includes('provider.example'), false);
  assert.deepEqual(firstPayload.pagination, {
    limit: 1,
    total: 2,
    hasMore: true,
    nextCursor: firstPayload.pagination.nextCursor,
  });
  assert.match(firstPayload.pagination.nextCursor, /^[A-Za-z0-9_-]+$/);

  const secondPage = await fetch(
    `${origin}/card-statistics?limit=1&cursor=${firstPayload.pagination.nextCursor}`,
    { headers },
  );
  assert.equal(secondPage.status, 200);
  const secondPayload = await secondPage.json() as Record<string, any>;
  assert.equal(secondPayload.data[0].cardId, 'CARD_2');
  assert.deepEqual(secondPayload.data[0].metrics, {
    deckPopularityPercent: null,
    deckWinratePercent: null,
    averageCopies: null,
    timesPlayed: null,
    winrateWhenPlayedPercent: null,
    winrateWhenDrawnPercent: null,
    keepPercentage: null,
    openingHandWinratePercent: null,
    averageTurnsInHand: null,
    averageTurnPlayed: null,
  });

  const cursorSliceMismatch = await fetch(
    `${origin}/card-statistics?format=wild&cursor=${firstPayload.pagination.nextCursor}`,
    { headers },
  );
  assert.equal(cursorSliceMismatch.status, 400);

  const selectedSlice = await fetch(
    `${origin}/card-statistics?format=wild&period=patch&rank=platinum&limit=500`,
    { headers },
  );
  assert.equal(selectedSlice.status, 200);
  assert.deepEqual(querySlice(await selectedSlice.json() as Record<string, any>), {
    format: 'wild',
    period: 'patch',
    rank: 'platinum',
  });
  assert.ok(calls.includes('list:wild:patch:platinum'));

  const detail = await fetch(
    `${origin}/cards/CARD_1/statistics?format=wild&period=7d&rank=diamond_4_1`,
    { headers },
  );
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json() as Record<string, any>;
  assert.equal(detailPayload.data.cardId, 'CARD_1');
  assert.equal(detailPayload.data.metrics.deckWinratePercent, 54.3);
  assert.deepEqual(querySlice(detailPayload), {
    format: 'wild',
    period: '7d',
    rank: 'diamond_4_1',
  });

  const missing = await fetch(`${origin}/cards/MISSING_1/statistics`, { headers });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    error: {
      code: 'CARD_STATISTICS_NOT_FOUND',
      message: 'Card statistics were not found',
    },
  });

  const history = await fetch(
    `${origin}/cards/CARD_1/statistics/history?format=wild&period=14d&rank=diamond&days=365`,
    { headers },
  );
  assert.equal(history.status, 200);
  const historyPayload = await history.json() as Record<string, any>;
  assert.deepEqual(querySlice(historyPayload), {
    format: 'wild',
    period: '14d',
    rank: 'diamond',
  });
  assert.equal(historyPayload.meta.days, 365);
  assert.deepEqual(historyPayload.data[0], {
    recordedAt: '2026-07-29T10:25:00.000Z',
    metrics: {
      deckPopularityPercent: 11.8,
      deckWinratePercent: 53.7,
      averageCopies: 1.3,
      timesPlayed: 221,
      winrateWhenPlayedPercent: 56.9,
      winrateWhenDrawnPercent: 54.8,
      keepPercentage: 42.1,
      openingHandWinratePercent: 51.9,
      averageTurnsInHand: 2.9,
      averageTurnPlayed: 4.2,
    },
  });
  assert.equal(JSON.stringify(historyPayload).includes('PRIVATE_'), false);
  assert.ok(calls.includes('history:wild:CARD_1:14d:diamond:365'));

  for (const query of [
    '?format=classic',
    '?rank=gold',
    '?period=30d',
    '?limit=501',
    '?limit[]=2',
  ]) {
    const invalid = await fetch(`${origin}/card-statistics${query}`, { headers });
    assert.equal(invalid.status, 400, query);
    assert.deepEqual(await invalid.json(), {
      error: {
        code: 'INVALID_CARD_STATISTICS_QUERY',
        message: 'Card statistics query is invalid',
      },
    });
  }

  const invalidDays = await fetch(
    `${origin}/cards/CARD_1/statistics/history?days=366`,
    { headers },
  );
  assert.equal(invalidDays.status, 400);

  const unchanged = await fetch(`${origin}/card-statistics?limit=1`, {
    headers: {
      ...headers,
      'If-None-Match': String(firstPage.headers.get('etag')),
    },
  });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');

  failLoads = true;
  const unavailable = await fetch(`${origin}/card-statistics?format=wild`, { headers });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await unavailable.json(), {
    error: {
      code: 'CARD_STATISTICS_UNAVAILABLE',
      message: 'Card statistics are temporarily unavailable',
    },
  });
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('public API card statistics contract tests passed');
