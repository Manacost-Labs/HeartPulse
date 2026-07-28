import assert from 'node:assert/strict';
import {
  analyticsQueryRange,
  defaultAnalyticsDateRange,
  formatRub,
} from '../src/features/boostyAnalyticsModel.js';

assert.deepEqual(
  defaultAnalyticsDateRange(new Date('2026-07-28T16:30:00.000Z')),
  { from: '2026-04-30', to: '2026-07-28' },
);
assert.deepEqual(
  analyticsQueryRange({ from: '2026-07-01', to: '2026-07-28' }),
  {
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-07-29T00:00:00.000Z',
  },
);
assert.equal(analyticsQueryRange({ from: '2026-07-29', to: '2026-07-28' }), null);
assert.match(formatRub(1234.5), /1.?234,50/);

console.log('Boosty analytics model tests passed');
