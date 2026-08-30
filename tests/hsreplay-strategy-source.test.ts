import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHsReplayStrategyPayload } from '../server/modules/publicApi/hsreplayStrategySource.js';

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

console.log('hsreplay strategy source tests passed');
