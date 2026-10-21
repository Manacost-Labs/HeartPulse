import assert from 'node:assert/strict';
import test from 'node:test';
import { weeklyDeckItems, weeklyDeckRows, weeklyDecksPath } from '../src/modules/home/model/weeklyDecks';

const deck = (slug: string, winrate: number) => ({ slug, archetypeLabel: slug, classKey: 'warrior', winrate, games: 500 });

test('the board reads the public teaser of the prewarmed meta slice', () => {
  assert.equal(weeklyDecksPath('past_week'),
    '/api/standard-meta/teaser?format=standard&rank=diamond_legend&coin=any_player&min_games=100&period=past_week');
  assert.deepEqual(weeklyDeckItems({ items: [
    { slug: 'a', archetypeLabel: 'A', classKey: 'mage', winrate: 58.2, games: 431 },
    { slug: 'b', archetypeLabel: 'B', classKey: null, winrate: 'n/a', games: null },
    { archetypeLabel: 'без slug' },
    { slug: 'c', archetypeLabel: 'C' }, { slug: 'd', archetypeLabel: 'D' },
  ] }), [
    { slug: 'a', archetypeLabel: 'A', classKey: 'mage', winrate: 58.2, games: 431 },
    { slug: 'b', archetypeLabel: 'B', classKey: null, winrate: null, games: null },
    { slug: 'c', archetypeLabel: 'C', classKey: null, winrate: null, games: null },
  ]);
  assert.deepEqual(weeklyDeckItems({ error: 'down' }), []);
});

test('the change is the place against the wider window; no wider window claims no trend', () => {
  const current = [deck('a', 60), deck('b', 59), deck('c', 58)];
  assert.deepEqual(weeklyDeckRows(current, [deck('b', 61), deck('a', 60), deck('z', 57)]).map(row => [row.slug, row.widerPlace, row.trend]),
    [['a', 2, 'up'], ['b', 1, 'down'], ['c', null, 'up']]);
  assert.deepEqual(weeklyDeckRows(current, [deck('a', 60)]).map(row => row.trend), ['flat', 'up', 'up']);
  assert.deepEqual(weeklyDeckRows(current, null).map(row => [row.place, row.trend]), [[1, null], [2, null], [3, null]]);
});
