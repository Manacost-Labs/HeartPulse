import assert from 'node:assert/strict';

import {
  sortTrinketTierItems,
  trinketMetricView,
} from '../src/features/battlegroundTrinkets';

const sorted = sortTrinketTierItems([
  { id: 'late', avgPlacement: 3.46, pickRate: '29.4%' },
  { id: 'first', avgPlacement: 2.75, pickRate: '28.1%' },
  { id: 'missing', avgPlacement: null, pickRate: '' },
]);

assert.deepEqual(
  sorted.map(item => item.id),
  ['first', 'late', 'missing'],
  'accessories inside a tier must be ordered by average placement',
);

assert.deepEqual(
  trinketMetricView({ avgPlacement: 2.75, pickRate: '28.1%' }),
  {
    averagePlacement: '2,75',
    pickRate: '28,1%',
  },
  'the card must expose both average placement and pick frequency',
);

console.log('battleground trinket metric tests passed');
