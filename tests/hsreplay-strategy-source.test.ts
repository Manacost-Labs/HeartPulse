import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeHsReplayStrategyPayload,
} from '../server/modules/publicApi/hsreplayStrategySource.js';
import {
  createPublicBattlegroundStatistics,
  type PublicBattlegroundStatisticsSource,
} from '../server/modules/publicApi/battlegroundStatistics.js';

test('normalizes the published HSReplay comps catalog without collapsing tiers', () => {
  const payload = normalizeHsReplayStrategyPayload({
    fetched_at: '2026-08-30T13:42:12.789113+00:00',
    data: {
      structured: {
        comps: [
          {
            id: 'hsreplay-92',
            name: 'Elementals',
            strategy_title: 'Elementals - Unbound Tempest',
            tier: 'S',
            difficulty: 'Easy',
            description: 'Play elementals to scale from big shop',
            core_cards: [{ card_id: 'BG36_352', dbfId: 132983, name: 'Unbound Tempest' }],
          },
          {
            id: 'hsreplay-76',
            name: 'Demons',
            strategy_title: 'Demons - APM Shop Buff',
            tier: 'A',
            difficulty: 'Medium',
            additional_cards: [{ id: 'BG28_633', dbfId: 110664, name: 'Felboar' }],
          },
        ],
      },
    },
  });

  assert.equal(payload.fetchedAt, '2026-08-30T13:42:12.789113+00:00');
  assert.equal(payload.count, 2);
  assert.deepEqual(payload.tierCounts, { S: 1, A: 1, B: 0, C: 0, D: 0 });
  assert.equal((payload.tiers as Record<string, any[]>).S[0].difficulty, 'Легкая');
  assert.equal((payload.tiers as Record<string, any[]>).A[0].difficulty, 'Средняя');
  assert.equal((payload.tiers as Record<string, any[]>).S[0].coreCards[0].frame, 'https://api.kolodahearthstone.com/uploads/framed/BG36_352.png');
  assert.equal((payload.tiers as Record<string, any[]>).A[0].additionalCards[0].role, 'ADDON');
});

test('ignores malformed comps instead of inventing a D-tier fallback', () => {
  const payload = normalizeHsReplayStrategyPayload({
    data: { structured: { comps: [{ id: 'broken', tier: 'D' }, { id: 'no-tier' }] } },
  });

  assert.equal(payload.count, 1);
  assert.equal((payload.tiers as Record<string, any[]>).D.length, 1);
  assert.equal((payload.tiers as Record<string, any[]>).S.length, 0);
});

test('preserves safe publication and upstream freshness metadata', () => {
  const payload = normalizeHsReplayStrategyPayload({
    fetched_at: '2026-08-30T13:42:12.789113+00:00',
    publication: {
      source_id: 'hsreplay_battlegrounds_comps',
      mode: 'stable',
      channel: 'stable',
      published_at: '2026-08-30T13:42:12.789113+00:00',
      stale: true,
      storage_channel: 'published_lkg',
      fallback_reason: 'must not leak',
    },
    data: {
      structured: {
        upstream_freshness: {
          status: 'stale',
          reason: 'upstream_snapshot_too_old',
          observed_at: '2026-08-30T13:42:12.789113+00:00',
          age_seconds: 86_400,
          body_as_of: '2026-08-29T13:42:12.789113+00:00',
          response_headers: { 'last-modified': 'must not leak' },
        },
        comps: [],
      },
    },
  });

  assert.deepEqual(payload.publication, {
    mode: 'stable',
    channel: 'stable',
    publishedAt: '2026-08-30T13:42:12.789113+00:00',
    stale: true,
  });
  assert.deepEqual(payload.upstreamFreshness, {
    status: 'stale',
    observedAt: '2026-08-30T13:42:12.789113+00:00',
    ageSeconds: 86_400,
    bodyAsOf: '2026-08-29T13:42:12.789113+00:00',
  });
  assert.equal(JSON.stringify(payload).includes('fallback_reason'), false);
  assert.equal(JSON.stringify(payload).includes('response_headers'), false);
  assert.equal(JSON.stringify(payload).includes('source_id'), false);
});

function strategySource(payload: Record<string, unknown>): PublicBattlegroundStatisticsSource {
  return {
    loadHeroes: async () => ({}),
    loadMinions: async () => ({}),
    loadTierLists: async () => payload,
  };
}

function normalizedStrategyPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    list: 'strategies',
    source: 'hsreplay',
    fetchedAt: now,
    tiers: { S: [{ id: 'hsreplay-1', title: 'Elementals' }] },
    ...overrides,
  };
}

test('public statistics marks an explicit LKG publication as stale', async () => {
  const publication = {
    mode: 'stable',
    channel: 'stable',
    publishedAt: new Date().toISOString(),
    stale: true,
  };
  const service = createPublicBattlegroundStatistics(strategySource(normalizedStrategyPayload({
    publication,
  })));

  const result = await service.tierList('strategies', { source: 'hsreplay' });
  assert.ok(result);
  assert.equal(result.meta.dataStatus, 'stale');
  assert.equal(result.cacheSource, 'LKG');
  assert.deepEqual(result.meta.publication, publication);
});

test('public statistics marks an explicit stale upstream freshness state as stale', async () => {
  const upstreamFreshness = {
    status: 'stale',
    observedAt: new Date().toISOString(),
    ageSeconds: 172_800,
    bodyAsOf: new Date(Date.now() - 172_800_000).toISOString(),
  } as const;
  const service = createPublicBattlegroundStatistics(strategySource(normalizedStrategyPayload({
    upstreamFreshness,
  })));

  const result = await service.tierList('strategies', { source: 'hsreplay' });
  assert.ok(result);
  assert.equal(result.meta.dataStatus, 'stale');
  assert.equal(result.cacheSource, 'LKG');
  assert.deepEqual(result.meta.upstreamFreshness, upstreamFreshness);
});

test('public statistics rejects a future fetched timestamp instead of reporting fresh', async () => {
  const service = createPublicBattlegroundStatistics(strategySource(normalizedStrategyPayload({
    fetchedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })));

  const result = await service.tierList('strategies', { source: 'hsreplay' });
  assert.ok(result);
  assert.equal(result.meta.dataStatus, 'stale');
  assert.equal(result.cacheSource, 'LKG');
});

test('public statistics fails closed when freshness evidence is malformed', async () => {
  const payload = normalizeHsReplayStrategyPayload({
    fetched_at: new Date().toISOString(),
    data: { structured: { upstream_freshness: {} } },
  });
  assert.deepEqual(payload.upstreamFreshness, {
    status: 'unknown',
    observedAt: null,
    ageSeconds: null,
    bodyAsOf: null,
  });
  assert.equal(payload.dataStatus, 'stale');
  assert.equal(payload.cacheSource, 'LKG');
});

console.log('hsreplay strategy source tests passed');
