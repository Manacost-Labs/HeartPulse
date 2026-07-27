import assert from 'node:assert/strict';
import {
  CONSTRUCTED_CARD_PERIOD_OPTIONS,
  CONSTRUCTED_CARD_RANK_OPTIONS,
  constructedCardPeriodFromSearch,
  constructedCardPeriodUrl,
  constructedCardRankFromSearch,
  constructedCardStatsFormatFromSearch,
  constructedCardStatsUrl,
} from '../src/features/constructedCardPeriods.js';

assert.deepEqual(
  CONSTRUCTED_CARD_PERIOD_OPTIONS.map(option => option.id),
  ['1d', '3d', '7d', '14d', 'patch'],
);
assert.deepEqual(
  CONSTRUCTED_CARD_RANK_OPTIONS.map(option => option.id),
  ['legend', 'diamond_4_1', 'diamond', 'platinum'],
);
assert.equal(constructedCardPeriodFromSearch(''), '1d');
assert.equal(constructedCardPeriodFromSearch('?period=7d'), '7d');
assert.equal(constructedCardPeriodFromSearch('?period=month'), '1d');
assert.equal(
  constructedCardPeriodUrl('/standard/cards/standard', '14d', '?view=table'),
  '/standard/cards/standard?view=table&period=14d',
);
assert.equal(constructedCardRankFromSearch('?rank=diamond_4_1'), 'diamond_4_1');
assert.equal(constructedCardRankFromSearch('?rank=gold'), 'legend');
assert.equal(constructedCardStatsFormatFromSearch('?statsFormat=wild', 'standard'), 'wild');
assert.equal(constructedCardStatsFormatFromSearch('?statsFormat=classic', 'standard'), 'standard');
assert.equal(
  constructedCardStatsUrl(
    '/standard/cards/standard/CARD_1',
    { period: '7d', rank: 'platinum', statsFormat: 'wild', defaultStatsFormat: 'standard' },
  ),
  '/standard/cards/standard/CARD_1?period=7d&rank=platinum&statsFormat=wild',
);
assert.equal(
  constructedCardStatsUrl(
    '/standard/cards/wild/CARD_1',
    { period: '1d', rank: 'legend', statsFormat: 'wild', defaultStatsFormat: 'wild' },
    '?period=14d&rank=diamond&statsFormat=standard',
  ),
  '/standard/cards/wild/CARD_1',
);
assert.equal(
  constructedCardPeriodUrl('/standard/cards/standard', '1d', '?view=table&period=7d'),
  '/standard/cards/standard?view=table',
);

console.log('constructed-card period URL contracts passed');
