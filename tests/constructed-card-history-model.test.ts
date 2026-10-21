import assert from 'node:assert/strict';
import {
  cardHistoryRanges,
  cardHistoryView,
  formatHistoryMoment,
  isSampledSnapshot,
  winrateInterval,
  type ConstructedCardHistoryPoint,
} from '../src/features/constructedCardHistoryModel.js';

const point = (
  recordedAt: string,
  values: Partial<ConstructedCardHistoryPoint> = {},
): ConstructedCardHistoryPoint => ({
  recordedAt,
  deckPopularity: null,
  deckWinrate: null,
  averageCopies: null,
  timesPlayed: null,
  winrateWhenPlayed: null,
  winrateWhenDrawn: null,
  keepPercentage: null,
  openingHandWinrate: null,
  averageTurnsInHand: null,
  averageTurnPlayed: null,
  ...values,
});
const UTC = { timeZone: 'UTC' };

// Production BE_228 (Стандарт · Легенда · 1 день) before and after release: the source publishes
// a winrate only from 100 plays, the earlier snapshots are 0–3 plays and 0% popularity.
const preRelease = { deckPopularity: 0, timesPlayed: 1, deckWinrate: null };
const released = { deckPopularity: 7.68, deckWinrate: 59.25, timesPlayed: 2748, winrateWhenPlayed: 58.98 };
const newCard = [
  point('2026-10-20T20:38:52.095Z', preRelease),
  point('2026-10-20T23:31:40.936Z', preRelease),
  point('2026-10-21T00:37:39.247Z', preRelease),
  point('2026-10-21T05:01:30.268Z', preRelease),
  point('2026-10-21T08:36:05.621Z', released),
  point('2026-10-21T12:35:40.089Z', released),
];

assert.equal(isSampledSnapshot(newCard[0]), false, 'a few plays without a winrate is not a measurement');
assert.equal(isSampledSnapshot(newCard[4]), true);
assert.equal(isSampledSnapshot(point('2026-10-21T00:00:00.000Z', { timesPlayed: 140 })), true);

const fresh = cardHistoryView(newCard, 'deckPopularity', UTC);
assert.equal(fresh.trackedSince, Date.parse('2026-10-20T20:38:52.095Z'), 'tracking starts with the first snapshot');
assert.equal(fresh.sampledSince, Date.parse('2026-10-21T08:36:05.621Z'));
assert.deepEqual(fresh.points.map(item => item.y), [7.68, 7.68], 'pre-release zeros are not drawn as values');
assert.equal(fresh.trend, false, 'two snapshots are not a trend');
assert.equal(fresh.change, null, 'no change is reported without a real earlier value');
assert.equal(fresh.latest?.value, 7.68);
assert.equal(fresh.resolution, 'snapshot');
assert.equal(fresh.points[0].label, '21 окт, 08:36', 'snapshots of one day are told apart by time');

const neverSampled = cardHistoryView(newCard.slice(0, 4), 'deckPopularity', UTC);
assert.equal(neverSampled.sampledSince, null);
assert.equal(neverSampled.points.length, 0);
assert.equal(neverSampled.latest, null);

// A sampled card that later falls out of the meta keeps its small values: they are real.
const fading = cardHistoryView([
  point('2026-10-01T10:00:00.000Z', { deckPopularity: 4.2, deckWinrate: 51, timesPlayed: 900 }),
  point('2026-10-01T18:00:00.000Z', { deckPopularity: 3.1, deckWinrate: 50, timesPlayed: 600 }),
  point('2026-10-02T10:00:00.000Z', { deckPopularity: 0.4, timesPlayed: 40 }),
], 'deckPopularity', UTC);
assert.deepEqual(fading.points.map(item => item.y), [4.2, 3.1, 0.4]);
assert.equal(fading.trend, true);
assert.ok(Math.abs((fading.change ?? 0) + 3.8) < 1e-9, 'change is measured from the first real value');
assert.deepEqual([fading.minimum?.value, fading.maximum?.value], [0.4, 4.2]);

// Longer histories are daily: the last snapshot of a day stands for it, missing days break the line.
const daily = cardHistoryView([
  point('2026-10-10T09:00:00.000Z', { deckPopularity: 10, deckWinrate: 52, timesPlayed: 3000, winrateWhenPlayed: 55 }),
  point('2026-10-10T21:00:00.000Z', { deckPopularity: 11, deckWinrate: 52, timesPlayed: 3100, winrateWhenPlayed: 56 }),
  point('2026-10-11T21:00:00.000Z', { deckPopularity: 12, deckWinrate: 53, timesPlayed: 3200, winrateWhenPlayed: 57 }),
  point('2026-10-12T21:00:00.000Z', { deckPopularity: 13, deckWinrate: 53, timesPlayed: 3300, winrateWhenPlayed: 58 }),
  point('2026-10-15T21:00:00.000Z', { deckPopularity: 14, deckWinrate: 54, timesPlayed: 3400, winrateWhenPlayed: 59 }),
], 'winrateWhenPlayed', UTC);
assert.equal(daily.resolution, 'day');
assert.deepEqual(daily.points.map(item => item.y), [56, 57, 58, null, 59], 'a gap of missing days is not bridged');
assert.equal(daily.points[0].label, '10 окт');
assert.ok(daily.points[0].low !== undefined && daily.points[0].low! < 56 && daily.points[0].high! > 56,
  'the winrate when played carries a 95% interval from its play count');
assert.equal(cardHistoryView(newCard, 'deckWinrate', UTC).points[0].low, undefined,
  'deck winrate has no known game count, so no interval is invented');

// Comparison: the baseline is aligned to the plotted snapshots by timestamp.
const compared = cardHistoryView(newCard, 'deckWinrate', {
  ...UTC,
  reference: [
    { recordedAt: '2026-10-21T08:36:05.621Z', deckWinrate: 50.4, winrateWhenPlayed: 55 },
    { recordedAt: '2026-10-21T12:35:40.089Z', deckWinrate: 50.1, winrateWhenPlayed: 55 },
  ],
});
assert.deepEqual(compared.points.map(item => item.reference), [50.4, 50.1]);

const [low, high] = winrateInterval(50, 400);
assert.ok(Math.abs(low - 45.13) < 0.05 && Math.abs(high - 54.87) < 0.05);
assert.equal(formatHistoryMoment(Date.parse('2026-10-21T14:00:00.000Z'), true, 'UTC'), '21 окт, 14:00');

// Range buttons only offer what the history covers.
const now = Date.parse('2026-10-21T12:00:00.000Z');
assert.deepEqual(cardHistoryRanges(Date.parse('2026-10-20T20:00:00.000Z'), now), [],
  'a history shorter than the smallest range offers no range choice');
assert.deepEqual(cardHistoryRanges(Date.parse('2026-09-16T16:00:00.000Z'), now).map(item => [item.days, item.enabled]),
  [[30, true], [90, true], [180, false]], '35 days: 90 shows everything, 180 adds nothing');
assert.deepEqual(cardHistoryRanges(null, now), []);

console.log('constructed-card history model contracts passed');
