import assert from 'node:assert/strict';
import {
  CONSTRUCTED_CARD_PERIOD_OPTIONS,
  constructedCardPeriodFromSearch,
  constructedCardPeriodUrl,
} from '../src/features/constructedCardPeriods.js';

assert.deepEqual(
  CONSTRUCTED_CARD_PERIOD_OPTIONS.map(option => option.id),
  ['1d', '3d', '7d', '14d', 'patch'],
);
assert.equal(constructedCardPeriodFromSearch(''), '1d');
assert.equal(constructedCardPeriodFromSearch('?period=7d'), '7d');
assert.equal(constructedCardPeriodFromSearch('?period=month'), '1d');
assert.equal(
  constructedCardPeriodUrl('/standard/cards/standard', '14d', '?view=table'),
  '/standard/cards/standard?view=table&period=14d',
);
assert.equal(
  constructedCardPeriodUrl('/standard/cards/standard', '1d', '?view=table&period=7d'),
  '/standard/cards/standard?view=table',
);

console.log('constructed-card period URL contracts passed');
