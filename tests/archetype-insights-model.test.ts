import assert from 'node:assert/strict';
import {
  archetypeHistoryCharts,
  archetypeRadarProfile,
  dailyGames,
  deckManaCurve,
  historyKpiComparison,
  wilsonInterval,
} from '../src/features/archetypeInsightsModel.js';
import { rankHeatCell } from '../src/features/archetypeRankHeatModel.js';

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

// History charts: the winrate carries its 95% Wilson band; every point names its HSGuru period.
const charts = archetypeHistoryCharts(patched);
assert.equal(charts.winrate.length, 6);
assert.equal(charts.winrate[0].y, 52);
const width = (point: { low?: number | null; high?: number | null }) => point.high! - point.low!;
assert.ok(width(charts.winrate[0]) > width(charts.winrate[4]), 'a smaller sample draws a wider band');
assert.deepEqual(charts.popularity.map(point => point.segment), ['patch_36.6.3', 'patch_36.6.3', 'patch_36.6.3', 'patch_36.6.3', 'patch_36.6.3', 'black_empire']);
assert.match(charts.popularity[0].tick ?? '', /12/);
assert.match(charts.popularity[0].detail ?? '', /1\s000 игр/);

// Games accumulate inside an HSGuru period: the chart shows games gained over the last 24 hours.
const hour = 60 * 60 * 1000;
const at = (hours: number) => new Date(Date.UTC(2026, 9, 10) + hours * hour).toISOString();
const daily = dailyGames([
  { recordedAt: at(0), games: 1_000, patch: 'p1' },
  { recordedAt: at(12), games: 1_600, patch: 'p1' },
  { recordedAt: at(24), games: 3_000, patch: 'p1' },
  { recordedAt: at(36), games: 3_400, patch: 'p1' },
  { recordedAt: at(84), games: 6_400, patch: 'p1' },
  { recordedAt: at(86), games: 100, patch: 'p2' },
  { recordedAt: at(90), games: 300, patch: 'p2' },
  { recordedAt: at(98), games: 900, patch: 'p2' },
  { recordedAt: at(110), games: 50, patch: 'p2' },
]);
assert.equal(daily[0].games, null, 'the first slice of a period has nothing to subtract');
assert.equal(daily[1].games, 1_200, 'a half-day window is scaled to a day');
assert.equal(daily[1].hours, 12);
assert.equal(daily[2].games, 2_000);
assert.equal(daily[3].games, 1_800, 'the base is the newest slice at least 24 hours older');
assert.equal(daily[4].games, 1_500, 'a gap averages the gained games over its length');
assert.equal(daily[5].games, null, 'a new period restarts the count');
assert.equal(daily[6].games, null, 'a window shorter than six hours is too noisy to scale');
assert.equal(daily[7].games, 1_600);
assert.equal(daily[8].games, null, 'a shrinking cumulative count is a source correction, not negative games');

// Rank heatmap colour: diverging around 50%, paler when the sample cannot tell the difference.
const even = rankHeatCell(50, 50_000);
assert.equal(even.tone, 'even');
assert.equal(even.strength, 0);
const strongUp = rankHeatCell(60, 50_000);
const weakUp = rankHeatCell(60, 120);
const down = rankHeatCell(40, 50_000);
assert.equal(strongUp.tone, 'above');
assert.equal(down.tone, 'below');
assert.ok(strongUp.strength > 0.9 && weakUp.strength < strongUp.strength / 2, 'a small sample is drawn paler');
assert.notEqual(strongUp.fill, down.fill);
assert.ok(rankHeatCell(34.5, 5_000).strength > rankHeatCell(45, 5_000).strength, 'a larger deviation is more intense');
assert.equal(rankHeatCell(null, null).tone, 'empty');
assert.equal(rankHeatCell(48, 24_856).significant, true);
assert.equal(rankHeatCell(51, 300).significant, false);
const contrast = (fill: string, ink: string) => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(fill), luminance(ink)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};
for (const winrate of [20, 34.5, 42, 47, 50, 53, 58, 66, 80]) {
  for (const games of [100, 900, 5_000, 100_000]) {
    const cell = rankHeatCell(winrate, games);
    assert.ok(contrast(cell.fill, cell.ink) >= 4.5, `${winrate}% / ${games}: value text contrast ${contrast(cell.fill, cell.ink).toFixed(2)}`);
  }
}

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

console.log('archetype insights model tests passed');
