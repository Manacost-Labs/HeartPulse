import assert from 'node:assert/strict';
import { buildStandardMetaTrends, type MetaTrendSlice } from '../server/standardMetaTrends.js';
import { parseStandardMetaTrends } from '../shared/standardMetaTrendsContract.js';
import { STANDARD_META_ROLLING_PERIODS, type StandardMetaPeriod } from '../shared/standardMetaPeriods.js';

type Row = MetaTrendSlice['items'][number];
const slice = (period: StandardMetaPeriod, items: Row[]): MetaTrendSlice => ({ period, updatedAt: '2026-10-21T00:16:43Z', items });
// Quest Priest, Diamond–Legend, the HSGuru matrix of 2026-10-21 00:16 UTC;
// `ref` is a popular row that fixes each slice's total of games.
const ladderRows: Array<[number, number, number, number]> = [
  // games, winrate, popularity, total games of the slice
  [3004, 63.3, 23.7, 12675],
  [6771, 63.0, 22.0, 30667],
  [15892, 58.6, 13.4, 118409],
  [31694, 55.9, 10.2, 307870],
  [66285, 54.6, 8.7, 754750],
  [127818, 53.5, 8.2, 1540000],
  [342941, 53.1, 9.0, 3752875],
];
const ladder = STANDARD_META_ROLLING_PERIODS.map((period, index) => {
  const [games, winrate, popularity, total] = ladderRows[index];
  return slice(period, [
    { id: 'quest-priest', games, winrate, popularity },
    { id: 'ref', games: Math.round(total / 5), winrate: 50, popularity: 20 },
  ]);
});

// Rolling day: compared with the two days before it (3 days minus 1 day).
const day = buildStandardMetaTrends({ selected: ladder[2], ladder, minGames: 100 });
assert.deepEqual(day.comparison, { label: 'к пред. 2 дням', description: 'окно 1–3 дня назад' });
const dayPriest = day.items.find(item => item.id === 'quest-priest')!;
assert.equal(dayPriest.previous?.games, 31694 - 15892);
// (55.9·31694 − 58.6·15892) / 15802 = 53.18
assert.equal(dayPriest.previous?.winrate, 53.18);
// 15802 of (307870 − 118409) games
assert.equal(dayPriest.previous?.popularity, 8.34);
// Disjoint windows oldest first; the newest is the 3-hour slice itself.
assert.equal(day.buckets.length, 7);
assert.equal(day.buckets[0], '14–30 дн.');
assert.equal(day.buckets.at(-1), '0–3 ч');
assert.equal(dayPriest.winrates.at(-1), 63.3);
assert.equal(dayPriest.winrates[0], 52.86);
assert.ok(dayPriest.winrates.every(value => value !== null));

// A release window inside the last 30 days is compared with the rest of them.
const release = slice('black_empire', [
  { id: 'quest-priest', games: 8883, winrate: 63.3, popularity: 21.6 },
  { id: 'ref', games: 8215, winrate: 50, popularity: 20 },
]);
const releaseTrends = buildStandardMetaTrends({ selected: release, ladder, minGames: 100 });
assert.equal(releaseTrends.comparison?.label, 'к дням до периода');
assert.equal(releaseTrends.items[0].previous?.games, 342941 - 8883);
// A window longer than the last 30 days has no earlier part inside them.
const oldPatch = slice('patch_36.6.3', [{ id: 'quest-priest', games: 400000, winrate: 53, popularity: 9 }]);
assert.equal(buildStandardMetaTrends({ selected: oldPatch, ladder, minGames: 100 }).comparison, null);
// Nothing precedes the 30-day window.
const month = buildStandardMetaTrends({ selected: ladder[6], ladder, minGames: 100 });
assert.equal(month.comparison, null);
assert.ok(month.items.every(item => item.previous === null));

// Missing from the inner window means "fewer than its floor", so that split
// stays unknown instead of counting the whole outer window as new games.
const sparse = STANDARD_META_ROLLING_PERIODS.map((period, index) => slice(period, index < 2 ? [] : [
  { id: 'rare', games: 400 * index, winrate: 50 + index, popularity: 1 },
]));
const rare = buildStandardMetaTrends({ selected: sparse[3], ladder: sparse, minGames: 100 }).items[0];
assert.deepEqual(rare.winrates.slice(-3), [null, null, null]);
assert.ok(rare.previous);
// A split below the minimum sample, or rougher than half a point, is left out.
const strict = buildStandardMetaTrends({ selected: ladder[2], ladder, minGames: 20000 });
assert.equal(strict.items[0].previous, null);
const rough = STANDARD_META_ROLLING_PERIODS.map((period, index) => slice(period, [
  { id: 'flat', games: 10000 + index * 100, winrate: 50, popularity: 5 },
]));
assert.ok(buildStandardMetaTrends({ selected: rough[2], ladder: rough, minGames: 100 }).items[0].winrates.slice(0, -1)
  .every(value => value === null));
// A failed slice leaves its neighbours' windows unknown, nothing else.
const gap = buildStandardMetaTrends({ selected: ladder[4], ladder: ladder.map((entry, index) => index === 1 ? null : entry), minGames: 100 });
assert.deepEqual(gap.items[0].winrates.slice(-3).map(value => value === null), [true, true, false]);
assert.ok(gap.items[0].previous);

// The answer survives its own contract.
assert.deepEqual(parseStandardMetaTrends(JSON.parse(JSON.stringify(day))), day);
assert.throws(() => parseStandardMetaTrends({ ...day, items: [{ id: 'x', winrates: [1], previous: null }] }), /follow buckets/);
assert.throws(() => parseStandardMetaTrends({ ...day, period: 'next_month' }), /period/);
console.log('standard meta trends: ok');
