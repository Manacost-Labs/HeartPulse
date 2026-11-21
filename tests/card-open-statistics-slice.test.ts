import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOpenStatisticsSlice } from '../server/modules/constructedCards/openStatistics';
import {
  CONSTRUCTED_CARD_PERIOD_OPTIONS, CONSTRUCTED_CARD_RANK_OPTIONS, OPEN_STATISTICS_SLICE,
} from '../src/modules/constructedCards/public';

// The page shows and labels the slice the server opens to a guest; the two sides name it once each.
test('the open slice of the card page is the one the server opens to a guest, and only that one', () => {
  assert.equal(isOpenStatisticsSlice(OPEN_STATISTICS_SLICE.period, OPEN_STATISTICS_SLICE.rank), true);
  const open = CONSTRUCTED_CARD_PERIOD_OPTIONS.flatMap(period => CONSTRUCTED_CARD_RANK_OPTIONS
    .filter(rank => isOpenStatisticsSlice(period.id, rank.id)).map(rank => `${period.id}|${rank.id}`));
  assert.deepEqual(open, [`${OPEN_STATISTICS_SLICE.period}|${OPEN_STATISTICS_SLICE.rank}`]);
});
