import assert from 'node:assert/strict';
import type { StandardMetaItem } from '../shared/standardMetaContract.js';
import {
  sortStandardMetaItems,
  standardMetaTierGroups,
  standardMetaWinrateAxis,
  standardMetaWinrateEstimate,
} from '../src/features/standardMetaTableModel.js';

const item = (id: string, winrate: number | null, games: number | null, popularity: number | null = 1): StandardMetaItem => ({
  id, slug: id, archetype: id, archetypeLabel: id, translated: true, classKey: 'warlock',
  winrate, popularity, games, turns: 8, durationMinutes: 7, climbingSpeed: 1,
});

// The interval narrows with the sample: 489 and 46 226 games no longer read alike.
{
  const thin = standardMetaWinrateEstimate(58.5, 489)!;
  const wide = standardMetaWinrateEstimate(60.6, 46226)!;
  assert.equal(thin.lowSample, true);
  assert.equal(wide.lowSample, false);
  assert.ok(thin.high - thin.low > 8, `489 games: ±${(thin.high - thin.low) / 2}`);
  assert.ok(wide.high - wide.low < 1, `46 226 games: ±${(wide.high - wide.low) / 2}`);
  assert.ok(thin.low < 58.5 && thin.high > 58.5);
  assert.equal(standardMetaWinrateEstimate(null, 1000), null);
  assert.equal(standardMetaWinrateEstimate(55, 0), null);
}

assert.equal(standardMetaWinrateAxis(50), 50);
assert.equal(standardMetaWinrateAxis(20), 0);
assert.equal(standardMetaWinrateAxis(80), 100);

// Sorting keeps blanks last in both directions and the source order on ties.
{
  const items = [item('a', 55, 1000, 2), item('b', 60, 1000, null), item('c', 55, 1000, 5)];
  const rankById = new Map(items.map((entry, index) => [entry.id, index + 1]));
  const ids = (key: 'winrate' | 'popularity', direction: 'asc' | 'desc') => sortStandardMetaItems(items, { key, direction }, rankById).map(entry => entry.id);
  assert.deepEqual(ids('winrate', 'desc'), ['b', 'a', 'c']);
  assert.deepEqual(ids('winrate', 'asc'), ['a', 'c', 'b']);
  assert.deepEqual(ids('popularity', 'desc'), ['c', 'a', 'b']);
  assert.deepEqual(ids('popularity', 'asc'), ['a', 'c', 'b']);
  assert.deepEqual(sortStandardMetaItems(items, { key: null, direction: 'desc' }, rankById).map(entry => entry.id), ['a', 'b', 'c']);
}

// Tiers group by the lower bound, best first; a thin 61% is not placed above a confirmed 58%.
{
  const groups = standardMetaTierGroups([
    item('thin', 61, 150), item('solid', 58, 20000), item('even', 50, 5000), item('weak', 44, 5000), item('blank', null, null),
  ]);
  assert.deepEqual(groups.map(group => group.tier), ['S', 'A', 'B', 'C', 'D']);
  assert.deepEqual(groups.map(group => group.entries.map(entry => entry.item.id)), [['solid', 'thin'], [], ['even'], [], ['weak']]);
  assert.deepEqual(groups.map(group => group.floor), [53, 51, 49, 47, null]);
  assert.equal(groups.flatMap(group => group.entries).length, 4);
}
