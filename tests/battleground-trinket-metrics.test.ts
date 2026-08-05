import assert from 'node:assert/strict';

import {
  buildTrinketStatsRequest,
  tierItemsForDisplay,
  trinketFullArtUrl,
  sortTrinketTierItems,
  trinketPlacementBars,
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

assert.equal(
  tierItemsForDisplay(Array.from({ length: 27 }, (_, index) => index), 'trinkets', 6).length,
  27,
  'the trinket tier list must render the full tier without a show-more control',
);

assert.equal(
  tierItemsForDisplay(Array.from({ length: 27 }, (_, index) => index), 'minions', 6).length,
  6,
  'other tier lists must retain progressive disclosure',
);

assert.equal(
  trinketFullArtUrl({ id: 'BG32_MagicItem_205' }),
  'https://db.kolodahs.ru/uploads/library-full-art/BG32_MagicItem_205.png',
  'trinket medallions must use the locally mirrored full art',
);

assert.deepEqual(
  trinketPlacementBars([
    { place: 1, rate: '20%' },
    { place: 2, rate: '10%' },
    { place: 8, rate: '5%' },
  ]),
  [
    { place: 1, rate: 20, height: 100 },
    { place: 2, rate: 10, height: 50 },
    { place: 3, rate: 0, height: 0 },
    { place: 4, rate: 0, height: 0 },
    { place: 5, rate: 0, height: 0 },
    { place: 6, rate: 0, height: 0 },
    { place: 7, rate: 0, height: 0 },
    { place: 8, rate: 5, height: 25 },
  ],
  'placement bars must normalize all eight places against the strongest result',
);

console.log('battleground trinket metric tests passed');
