import assert from 'node:assert/strict';
import {
  heroCompositionRows, heroFinalBoards, heroPlacementColumns, heroPowerMatrix, heroTavernPace, heroTurnPoints,
} from '../src/modules/battlegrounds/model/heroAnalytics.js';

// Places: percent strings become numbers, the top four are the accent, a missing place is not 0%.
assert.deepEqual(heroPlacementColumns(['16.66%', '16,6%', null, '10%']).map(column => [column.label, column.value, column.accent]), [
  ['1', 16.66, true], ['2', 16.6, true], ['4', 10, true],
]);
assert.deepEqual(heroPlacementColumns(undefined), []);

// Turn points are ordered by turn and carry their sample.
assert.deepEqual(heroTurnPoints([{ combat_round: 2, combat_winrate: 29.8, data_points: 3812 }, { combat_round: 1, combat_winrate: 44.82, data_points: 2733 }],
  { turn: 'combat_round', value: 'combat_winrate', sample: 'data_points' }, 'Раунд', 'боёв').map(point => [point.x, point.y, point.label, point.detail]), [
  [1, 44.82, 'Раунд 1', '2\u00a0733 боёв'], [2, 29.8, 'Раунд 2', '3\u00a0812 боёв'],
]);

// Pace: the first turn each higher tier becomes the most common one; a later dip does not add a step.
assert.deepEqual(heroTavernPace([
  { turn: 1, recommended_tavern_tier: 1, pct_at_tier: 100 }, { turn: 2, recommended_tavern_tier: 2, pct_at_tier: 94.87 },
  { turn: 3, recommended_tavern_tier: 2, pct_at_tier: 68 }, { turn: 4, recommended_tavern_tier: 3, pct_at_tier: 80 },
  { turn: 5, recommended_tavern_tier: 2, pct_at_tier: 51 }, { turn: 6, recommended_tavern_tier: 4, pct_at_tier: 92 },
]), [{ turn: 2, tier: 2, share: 94.87 }, { turn: 4, tier: 3, share: 80 }, { turn: 6, tier: 4, share: 92 }]);

// Matrix: turns with their gold, tiers from the highest, missing cells are null.
const matrix = heroPowerMatrix([
  { turn: 2, tavern_tier: 1, gold: 4, invoked_rate: 0, total_data_points: 89 },
  { turn: 2, tavern_tier: 2, gold: 4, invoked_rate: 0, total_data_points: 1647 },
  { turn: 5, tavern_tier: 4, gold: 7, invoked_rate: 96.2, total_data_points: 1361 },
]);
assert.deepEqual(matrix.turns, [{ turn: 2, gold: 4 }, { turn: 5, gold: 7 }]);
assert.deepEqual(matrix.tiers, [4, 2, 1]);
assert.deepEqual(matrix.cell(5, 4), { rate: 96.2, games: 1361 });
assert.equal(matrix.cell(5, 1), null);

// Compositions: by games, Aberrations in Russian, small samples flagged.
const compositions = heroCompositionRows([
  { composition_id: 2, name: 'Мурлоки', num_games: 45, avg_placement: 3.977, confidence_interval: 0.74, popularity: '0.45%', popularity_value: 0.45 },
  { composition_id: 20, name: 'Драконы', num_games: 9389, avg_placement: 4.114, confidence_interval: 0.05, popularity: '94.21%' },
  { name: 'Aberrations', num_games: 96, avg_placement: 5.059, popularity: '0.96%' },
]);
assert.deepEqual(compositions.map(row => [row.name, row.share, row.lowSample]), [['Драконы', 94.21, false], ['Аберрации', 0.96, true], ['Мурлоки', 0.45, true]]);
assert.equal(compositions[0].interval, 0.05);

// Final boards: grouped by the final tavern tier, highest first; a one-game group (all 100%) is dropped.
const boards = heroFinalBoards([
  { dbfId: 1, name: 'Runic Arcanist', tavern_tier: 4, at_least_one: '100.00%', at_least_one_premium: '100.00%' },
  { dbfId: 2, name: 'Sky-hatch Runaway', tavern_tier: 4, at_least_one: '100.00%', at_least_one_premium: '100.00%' },
  { dbfId: 3, name: 'Crimson Vindicator', tavern_tier: 6, at_least_one: '73.29%', at_least_one_premium: '40.72%' },
  { dbfId: 4, name: 'Persistent Poet', tavern_tier: 6, at_least_one: '68.89%', at_least_one_premium: '56.55%' },
  { dbfId: 5, name: 'Heroic Broodmother', tavern_tier: 6, at_least_one: '57.81%', at_least_one_premium: '28.24%' },
  { dbfId: 3, name: 'Crimson Vindicator', tavern_tier: 5, at_least_one: '50.81%', at_least_one_premium: '17.21%' },
  { dbfId: 4, name: 'Persistent Poet', tavern_tier: 5, at_least_one: '71.31%', at_least_one_premium: '58.19%' },
], 2);
assert.deepEqual(boards.map(board => [board.tier, board.minions.map(minion => [minion.name, minion.share, minion.golden])]), [
  [6, [['Crimson Vindicator', 73.29, 40.72], ['Persistent Poet', 68.89, 56.55]]],
  [5, [['Persistent Poet', 71.31, 58.19], ['Crimson Vindicator', 50.81, 17.21]]],
]);
assert.equal(new Set(boards.flatMap(board => board.minions.map(minion => minion.key))).size, 4, 'every minion row has its own key');
