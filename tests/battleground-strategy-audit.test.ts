import assert from 'node:assert/strict';
import test from 'node:test';
import { auditBattlegroundStrategyPayload } from '../server/modules/publicApi/battlegroundStrategyAudit.js';

const cards = [{ cardId: 'BG36_001' }];

test('rejects the current HSReplay all-D shape without metrics', () => {
  const payload = {
    source: 'hsreplay',
    fetchedAt: '2026-08-30T10:02:08.403646+00:00',
    count: 19,
    tiers: {
      S: [],
      A: [],
      B: [],
      C: [],
      D: Array.from({ length: 19 }, (_, index) => ({ title: `Strategy ${index}`, additionalCards: cards })),
    },
  };

  const audit = auditBattlegroundStrategyPayload(payload);

  assert.equal(audit.ok, false);
  assert.equal(audit.status, 'invalid');
  assert.ok(audit.issues.includes('hsreplay_collapsed_d_tiers_without_metrics'));
  assert.equal(audit.strategiesWithCards, 19);
});

test('accepts a tiered strategy payload with complete card coverage', () => {
  const tiers = {
    S: [{ title: 'S strategy', coreCards: cards }],
    A: [{ title: 'A strategy', coreCards: cards }],
    B: [{ title: 'B strategy', coreCards: cards }],
    C: [],
    D: [{ title: 'D strategy', coreCards: cards }],
  };

  const audit = auditBattlegroundStrategyPayload({
    source: 'hsreplay',
    fetched_at: '2026-08-30T10:02:08.403646+00:00',
    count: 4,
    tiers,
  });

  assert.equal(audit.ok, true);
  assert.equal(audit.status, 'healthy');
  assert.deepEqual(audit.tierCounts, { S: 1, A: 1, B: 1, C: 0, D: 1 });
});

test('reports a count mismatch as invalid rather than silently accepting it', () => {
  const audit = auditBattlegroundStrategyPayload({
    source: 'firestone',
    fetchedAt: '2026-08-30T10:02:08.403646+00:00',
    count: 2,
    tiers: { S: [{ title: 'One', cards }], A: [], B: [], C: [], D: [] },
  });

  assert.equal(audit.ok, false);
  assert.equal(audit.status, 'invalid');
  assert.ok(audit.issues.includes('count_mismatch:2:1'));
});
