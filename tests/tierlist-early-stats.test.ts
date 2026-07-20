import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  normalizeTierlistEarlyStatsMetadata,
  tierlistEarlyStatsEtagToken,
} from '../server/tierlistEarlyStats.js';
import TierlistEarlyStatsNotice from '../src/features/TierlistEarlyStatsNotice.js';

const patchWindow = {
  active_from: '2026-07-21T00:00:00+02:00',
  active_until: '2026-07-28T00:00:00+02:00',
};

const normalized = normalizeTierlistEarlyStatsMetadata({
  source_id: 'hsreplay_arena_cards_advanced',
  data: {
    metadata: {
      data_phase: 'post_patch_early',
      provisional: true,
      accepted_rows: 74,
      baseline_rows: 1_228,
      coverage_ratio: 0.0603,
      minimum_sample: 10,
      patch_window: patchWindow,
    },
  },
});

assert.deepEqual(normalized, {
  data_phase: 'post_patch_early',
  provisional: true,
  accepted_rows: 74,
  baseline_rows: 1_228,
  coverage_ratio: 0.0603,
  minimum_sample: 10,
  patch_window: patchWindow,
});

assert.deepEqual(normalizeTierlistEarlyStatsMetadata({ data: { structured: { cards: [] } } }), {});

assert.deepEqual(normalizeTierlistEarlyStatsMetadata({
  fetched_at: '2026-07-21T00:20:00Z',
  view: {
    type: 'arena_card_tiers',
    provisional: true,
    data_phase: 'post_patch_early',
    accepted_rows: 20,
    baseline_rows: 1_228,
  },
}), {
  data_phase: 'post_patch_early',
  provisional: true,
  accepted_rows: 20,
  baseline_rows: 1_228,
});

const stableToken = tierlistEarlyStatsEtagToken({ provisional: false });
const provisionalToken = tierlistEarlyStatsEtagToken(normalized);
assert.notEqual(provisionalToken, stableToken);
assert.equal(provisionalToken, tierlistEarlyStatsEtagToken({ ...normalized }));
assert.notEqual(
  provisionalToken,
  tierlistEarlyStatsEtagToken({ ...normalized, accepted_rows: 75 }),
);

const hiddenNotice = renderToStaticMarkup(React.createElement(TierlistEarlyStatsNotice, {
  provisional: false,
}));
assert.equal(hiddenNotice, '');

const visibleNotice = renderToStaticMarkup(React.createElement(TierlistEarlyStatsNotice, {
  provisional: true,
}));
assert.match(visibleNotice, /Ранняя статистика после балансного патча/);
assert.match(visibleNotice, /Данных пока мало, показатели могут быстро меняться/);
assert.match(visibleNotice, /role="status"/);

console.log('tierlist early stats tests passed');
