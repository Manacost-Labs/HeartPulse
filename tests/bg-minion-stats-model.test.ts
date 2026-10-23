import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseBattlegroundMinionStats } from '../server/modules/battlegroundLibrary/minionStatsContract.js';
import {
  minionBoardSlots,
  placeDirection,
  minionPlacementTone,
  minionPurchaseMatrix,
  minionRoundCharts,
  minionStatsKpis,
} from '../src/features/battlegroundMinionStatsModel';

const stats = (dbfId: number) => parseBattlegroundMinionStats(JSON.parse(readFileSync(
  new URL(`./fixtures/bg-minion-stats-${dbfId}-20261021.json`, import.meta.url), 'utf8')).data);
const lowTier = stats(104551);
const highTier = stats(130298);

test('the Storybook view fixtures are the current Express output of the raw answers', () => {
  for (const [dbfId, parsed] of [[104551, lowTier], [130298, highTier]] as const) {
    const view = JSON.parse(readFileSync(new URL(`./fixtures/bg-minion-stats-view-${dbfId}-20261021.json`, import.meta.url), 'utf8'));
    assert.deepEqual(view, parsed);
  }
});

test('the placement gap leads the KPIs and lower placement is the good direction', () => {
  const kpis = minionStatsKpis(lowTier.normal);
  assert.deepEqual(kpis.map(item => item.id), ['placement', 'combat', 'popularity', 'impact', 'games']);
  assert.ok(Math.abs((kpis[0].value as number) - 0.3004) < 1e-9);
  assert.equal(kpis[0].caption, 'на 0,30 места хуже');
  assert.equal(kpis[3].caption, 'на 0,01 места хуже', 'impact says the same direction in words');
  assert.equal(kpis[1].value, 0.5683);
  assert.equal(minionPlacementTone(lowTier.normal), 'worse');
  assert.equal(minionPlacementTone({ ...lowTier.normal!, placementWith: 3.62 }), null, 'a gap that rounds to zero is neutral');
  assert.equal(minionPlacementTone({ ...lowTier.normal!, placementWith: 3.2 }), 'better');
  assert.deepEqual(minionStatsKpis(null), []);
});

test('a place difference reads the same way for every minion', () => {
  assert.equal(placeDirection(0.2), 'на 0,20 места лучше');
  assert.equal(placeDirection(-0.304), 'на 0,30 места хуже');
  assert.equal(placeDirection(0.004), 'как без него');
  const better = minionStatsKpis({ ...lowTier.normal!, placementWith: 3.16, placementWithout: 3.36 })[0];
  assert.ok(Math.abs((better.value as number) + 0.2) < 1e-9);
  assert.equal(better.caption, 'на 0,20 места лучше');
});

test('a KPI without data is left out, never shown as zero', () => {
  const kpis = minionStatsKpis({ ...lowTier.normal!, impact: null, placementWithout: null });
  assert.deepEqual(kpis.map(item => item.id), ['combat', 'popularity', 'games']);
});

test('round charts keep gaps and put a Wilson band on the combat winrate', () => {
  const charts = minionRoundCharts(lowTier, 'normal');
  assert.equal(charts.winrate.length, 16);
  assert.equal(charts.winrate[15].y, null, 'round 16 is below the threshold');
  const first = charts.winrate[0];
  assert.equal(first.y, 61.9);
  assert.ok(first.low! < 61.9 && first.high! > 61.9);
  assert.equal(first.detail, '3 895 боёв');
  assert.equal(charts.median, null, 'a 1/1 that never grows has no median chart');
  const golden = minionRoundCharts(highTier, 'golden');
  assert.ok(golden.median, 'a scaling minion shows its median stats');
  assert.equal(golden.median!.find(point => point.x === 12)?.detail, '57/59');
});

test('purchases become four heat rows with gaps for small samples', () => {
  const matrix = minionPurchaseMatrix(lowTier)!;
  assert.equal(matrix.columns[0], 'Ход 1');
  assert.equal(matrix.values.length, 4);
  assert.equal(matrix.values[0][0], 20.874);
  assert.ok(Number.isNaN(matrix.values[1][0]), 'no second copy on the first turn');
  assert.equal(matrix.values[3][1], 31.624);
});

test('board slots are ordered left to right with heat relative to the busiest slot', () => {
  const slots = minionBoardSlots(lowTier.positions.normal);
  assert.deepEqual(slots.map(slot => slot.position), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(slots[3].heat, 1);
  assert.ok(slots[0].heat > 0 && slots[0].heat < 0.5);
  assert.deepEqual(minionBoardSlots(null), []);
});

test('the source line names the source, slice and date in Russian', () => {
  });
