import assert from 'node:assert/strict';
import {
  constructedCardHistoryDelta,
  constructedCardHistoryDomain,
  constructedCardHistorySeries,
  type ConstructedCardHistoryPoint,
} from '../src/features/constructedCardHistoryModel.js';

const point = (
  recordedAt: string,
  deckPopularity: number | null,
): ConstructedCardHistoryPoint => ({
  recordedAt,
  deckPopularity,
  deckWinrate: null,
  averageCopies: null,
  timesPlayed: null,
  winrateWhenPlayed: null,
  winrateWhenDrawn: null,
  keepPercentage: null,
  openingHandWinrate: null,
  averageTurnsInHand: null,
  averageTurnPlayed: null,
});

const series = constructedCardHistorySeries([
  point('2026-07-03T10:00:00.000Z', 9.8),
  point('invalid', 99),
  point('2026-07-01T10:00:00.000Z', 8.2),
  point('2026-07-02T10:00:00.000Z', null),
  point('2026-07-03T10:00:00.000Z', 10.1),
], 'deckPopularity');

assert.deepEqual(series.map(item => item.value), [8.2, 10.1]);
assert.ok(Math.abs((constructedCardHistoryDelta(series) ?? 0) - 1.9) < 0.0001);
assert.deepEqual(constructedCardHistoryDomain([]), [0, 1]);
assert.deepEqual(constructedCardHistoryDomain([50]), [47.5, 52.5]);
const domain = constructedCardHistoryDomain([8.2, 10.1]);
assert.ok(domain[0] < 8.2 && domain[1] > 10.1);

console.log('constructed-card history model contracts passed');
