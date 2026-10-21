import assert from 'node:assert/strict';
import {
  archetypeRadarProfile,
  deckManaCurve,
  historyKpiComparison,
  rankHeatmapGrid,
  winrateBand,
  wilsonInterval,
} from '../src/features/archetypeInsightsModel.js';

const close = (actual: number, expected: number, digits = 2) => assert.equal(Number(actual.toFixed(digits)), expected);

// Wilson score interval: wide for a small sample, narrow for a large one, never past 0–100.
const [smallLow, smallHigh] = wilsonInterval(60, 20);
close(smallLow, 38.66); close(smallHigh, 78.12);
const [bigLow, bigHigh] = wilsonInterval(60, 20_000);
close(bigLow, 59.32); close(bigHigh, 60.68);
assert.deepEqual(wilsonInterval(50, 0), [0, 100]);
const [zeroLow] = wilsonInterval(0, 10);
assert.equal(zeroLow, 0);

const history = [
  { recordedAt: '2026-10-12T00:00:00.000Z', winrate: 52, popularity: 7, games: 1_000 },
  { recordedAt: '2026-10-15T00:00:00.000Z', winrate: 53, popularity: 7.5, games: 5_000 },
  { recordedAt: '2026-10-19T12:00:00.000Z', winrate: 54, popularity: 8, games: 9_000 },
  { recordedAt: '2026-10-20T00:00:00.000Z', winrate: 54.3, popularity: 8.9, games: 10_000 },
  { recordedAt: '2026-10-20T12:00:00.000Z', winrate: 55, popularity: 9, games: 11_000 },
  { recordedAt: '2026-10-21T00:00:00.000Z', winrate: 56, popularity: 9.5, games: 12_000 },
];

// The comparison point is the newest slice at least a day older than the latest one;
// the sparkline holds the slices of the last 7 days.
const kpi = historyKpiComparison(history);
assert.equal(kpi?.previous.recordedAt, '2026-10-20T00:00:00.000Z');
assert.deepEqual(kpi?.trend.map(point => point.winrate), [53, 54, 54.3, 55, 56]);
assert.equal(kpi?.gamesPrevious?.recordedAt, '2026-10-20T00:00:00.000Z');
assert.equal(historyKpiComparison(history.slice(-1)), null);
// A new HSGuru period restarts the game count: games compare only inside the latest period.
const patched = history.map((point, index) => ({ ...point, patch: index < 5 ? 'patch_36.6.3' : 'black_empire' }));
const acrossPeriods = historyKpiComparison(patched);
assert.equal(acrossPeriods?.previous.recordedAt, '2026-10-20T00:00:00.000Z', 'rates still compare across the period change');
assert.equal(acrossPeriods?.gamesPrevious, null);
assert.deepEqual(acrossPeriods?.gamesTrend.map(point => point.games), [12_000]);
assert.equal(historyKpiComparison([]), null);

const band = winrateBand(history);
assert.equal(band.length, 6);
assert.equal(band[0].actual, 52);
assert.ok(band[0].high! - band[0].low! > band[5].high! - band[5].low!, 'a smaller sample draws a wider band');
assert.ok(band[0].innerHigh! - band[0].innerLow! < band[0].high! - band[0].low!);
assert.match(band[0].label, /12/);

// Mana curve: card counts per cost bucket, 7+ together.
assert.deepEqual(deckManaCurve([
  { cost: 0, count: 1 }, { cost: 1, count: 2 }, { cost: 3, count: 2 }, { cost: 7, count: 1 }, { cost: 10, count: 2 }, { cost: null, count: 1 },
]), [3, 0, 2, 0, 0, 0, 3]);

// Radar: each axis is the percentile of the archetype among all archetypes of the format.
const items = [
  { slug: 'a', winrate: 50, popularity: 1, durationMinutes: 6, turns: 7, climbingSpeed: 0.2 },
  { slug: 'b', winrate: 55, popularity: 5, durationMinutes: 8, turns: 8, climbingSpeed: 0.5 },
  { slug: 'c', winrate: 60, popularity: 10, durationMinutes: 10, turns: 9, climbingSpeed: null },
];
const profile = archetypeRadarProfile(items[2], items);
assert.deepEqual(profile.map(axis => axis.key), ['winrate', 'popularity', 'durationMinutes', 'turns', 'climbingSpeed']);
assert.deepEqual(profile.map(axis => axis.score), [100, 100, 100, 100, null]);
assert.equal(archetypeRadarProfile(items[0], items)[0].score, 0);
assert.equal(archetypeRadarProfile(items[1], items)[0].score, 50);

// Heatmap grid: ranks are rows, periods are columns, a missing cell is NaN.
const grid = rankHeatmapGrid({
  ranks: [{ id: 'diamond', label: 'Алмаз 1–4' }, { id: 'legend', label: 'Легенда' }],
  periods: [{ id: 'past_day', label: 'Сутки' }, { id: 'past_week', label: 'Неделя' }],
  cells: [
    { rank: 'diamond', period: 'past_day', winrate: 51, games: 300 },
    { rank: 'diamond', period: 'past_week', winrate: 52.5, games: 2_000 },
    { rank: 'legend', period: 'past_week', winrate: 49, games: 800 },
    { rank: 'legend', period: 'past_day', winrate: null, games: null },
  ],
  updatedAt: null,
});
assert.deepEqual(grid.rows, ['Алмаз 1–4', 'Легенда']);
assert.deepEqual(grid.columns, ['Сутки', 'Неделя']);
assert.deepEqual(grid.values[0], [51, 52.5]);
assert.ok(Number.isNaN(grid.values[1][0]));
assert.equal(grid.filled, 3);

console.log('archetype insights model tests passed');
