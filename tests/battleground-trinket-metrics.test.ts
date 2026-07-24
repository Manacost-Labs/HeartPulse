import assert from 'node:assert/strict';

import {
  buildTrinketStatsRequest,
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
  trinketMetricView({ avgPlacement: 2.75, pickRate: '28.1%', games: 12_345 }),
  {
    averagePlacement: '2,75',
    pickRate: '28,1%',
    games: '≥ 12 345',
  },
  'the card must expose placement, pick frequency, and the minimum game sample',
);

assert.equal(
  buildTrinketStatsRequest('TOP_20_PERCENT', 'CURRENT_BATTLEGROUNDS_PATCH'),
  '/api/bg/tier-lists?list=trinkets&mmr=TOP_20_PERCENT&timeRange=CURRENT_BATTLEGROUNDS_PATCH',
  'MMR and period must select a real server-side data slice',
);

console.log('battleground trinket metric tests passed');
