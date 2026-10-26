import assert from 'node:assert/strict';
import {
  averageCost,
  deckDifference,
  formatProfileValue,
  intervalAxis,
  matchupBetween,
  profileComparison,
  profileSummary,
  sampleVerdict,
  winrateVerdict,
} from '../src/features/archetypeComparisonModel.js';

const card = (dbfId: number, name: string, cost: number | null, count: number) => ({ dbfId, id: `C_${dbfId}`, name, cost, rarity: 'COMMON', count });

// Card differences: by dbfId, sorted by cost then name; copies in common count once.
const left = [card(1, 'Искроцвет', 0, 2), card(2, 'Лужа жижи', 1, 2), card(3, 'Гейзер', 1, 1), card(9, 'Йогг', 10, 1)];
const right = [card(1, 'Искроцвет', 0, 2), card(2, 'Лужа жижи', 1, 1), card(4, 'Дух предков', 2, 2), card(5, 'Сфера', 1, 1)];
const difference = deckDifference(left, right);
assert.deepEqual(difference.onlyLeft.map(entry => entry.name), ['Гейзер', 'Йогг']);
assert.deepEqual(difference.onlyRight.map(entry => entry.name), ['Сфера', 'Дух предков']);
assert.deepEqual(difference.changed.map(entry => [entry.card.name, entry.left, entry.right]), [['Лужа жижи', 2, 1]]);
assert.equal(difference.shared, 3);

assert.equal(averageCost([card(1, 'a', 1, 2), card(2, 'b', 4, 1), card(3, 'c', null, 2)]), 2);
assert.equal(averageCost([]), null);

// Real Big Shaman builds #1 and #2 (4 050 games at 61.5%, 2 263 at 63.5%): the intervals
// overlap, so the two-point gap is not a verdict; the larger sample is the reliable one.
const close = winrateVerdict({ winrate: 61.5, games: 4_050 }, { winrate: 63.5, games: 2_263 });
assert.ok(close);
assert.equal(close.distinct, false);
assert.equal(close.leader, null);
assert.equal(Number(close.gap.toFixed(1)), -2);
const apart = winrateVerdict({ winrate: 56.3, games: 4_000 }, { winrate: 61.5, games: 4_050 });
assert.equal(apart?.leader, 'right');
assert.equal(winrateVerdict({ winrate: null, games: 10 }, { winrate: 50, games: 10 }), null);

// The axis of the interval chart: whole-percent ends one point outside both intervals, readable ticks.
assert.deepEqual(intervalAxis(close.left, close.right), { low: 58, high: 67, ticks: [58, 60, 62, 64, 66] });
assert.deepEqual(intervalAxis([62.7, 63.5], [63.4, 64.4]).ticks, [61, 62, 63, 64, 65, 66], 'Zoolock #1 and #2: a five-point span keeps every point');
assert.deepEqual(intervalAxis([30, 45], [60, 80]).ticks, [30, 40, 50, 60, 70, 80], 'a wide span falls back to ten-point steps');

assert.deepEqual(sampleVerdict(4_050, 2_263)?.leader, 'left');
assert.equal(sampleVerdict(1_000, 1_100)?.leader, null);
assert.equal(sampleVerdict(0, 100), null);

// Profile: values, percentiles among the format and the side ahead on each metric.
const items = [
  { slug: 'big-shaman', archetypeLabel: 'Биг Шаман', winrate: 61.2, popularity: 4.1, durationMinutes: 9.4, turns: 9.1, climbingSpeed: 1.9 },
  { slug: 'boar-rogue', archetypeLabel: 'Разбойник на вепрях', winrate: 55, popularity: 4.2, durationMinutes: 6.1, turns: 7.2, climbingSpeed: 0.9 },
  { slug: 'quest-mage', archetypeLabel: 'Квест Маг', winrate: 50, popularity: 2, durationMinutes: 8, turns: 8, climbingSpeed: 0.4 },
];
const rows = profileComparison(items[0], items[1], items);
const winrate = rows.find(row => row.key === 'winrate');
assert.equal(winrate?.leader, 'mine');
assert.equal(winrate?.leaderIsBetter, true);
assert.equal(winrate?.minePercentile, 100);
assert.equal(winrate?.theirPercentile, 50);
const duration = rows.find(row => row.key === 'durationMinutes');
assert.equal(duration?.leader, 'mine');
assert.equal(duration?.leaderIsBetter, false, 'a longer match is not an advantage');
assert.equal(rows.find(row => row.key === 'popularity')?.leader, null, 'popularity 4.1 vs 4.2 is a tie');
// A shorter match is the better one: the opponent's longer games are not its advantage.
const shorter = profileComparison({ ...items[0], durationMinutes: 3.1 }, { ...items[1], durationMinutes: 4.4 }, items)
  .find(row => row.key === 'durationMinutes');
assert.equal(shorter?.leader, 'theirs');
assert.equal(shorter?.leaderIsBetter, false);
assert.match(profileSummary('Биг Шаман', 'Разбойник', profileComparison({ ...items[0], durationMinutes: 3.1 }, { ...items[1], durationMinutes: 4.4 }, items)),
  /^Биг Шаман выигрывает чаще, быстрее поднимается по ладдеру и играет более короткие матчи, чем Разбойник\./);
assert.equal(
  profileSummary('Биг Шаман', 'Разбойник на вепрях', rows),
  'Биг Шаман выигрывает чаще и быстрее поднимается по ладдеру, но играет более долгие матчи, чем Разбойник на вепрях. Также доходит до более поздних ходов.',
);
assert.equal(
  profileSummary('A', 'B', profileComparison(items[0], { ...items[0], slug: 'copy' }, items)),
  'A и B почти не различаются по статистике формата.',
);
assert.equal(formatProfileValue('durationMinutes', 7.66), '7,7 мин');
assert.equal(formatProfileValue('climbingSpeed', null), '—');

// HSGuru matchups: the forward cell, the reverse one and why a pair is missing.
const table = { rows: [
  { archetype: 'Big Shaman', cells: [{ opponent: 'Boar Rogue', winrate: 54.3 }, { opponent: 'Quest Mage', winrate: null }] },
  { archetype: 'Boar Rogue', cells: [{ opponent: 'Big Shaman', winrate: 45.1 }] },
] };
assert.deepEqual(matchupBetween(table, 'Big Shaman', 'boar rogue'), { winrate: 54.3, reverse: 45.1, missing: null });
assert.equal(matchupBetween(table, 'Big Shaman', 'Quest Mage')?.missing, 'pair');
assert.equal(matchupBetween(table, 'Quest Mage', 'Big Shaman')?.missing, 'archetype');
assert.equal(matchupBetween(table, 'Big Shaman', 'Zoo Warlock')?.missing, 'opponent');
assert.equal(matchupBetween(null, 'a', 'b'), null);

console.log('archetype comparison model: ok');
