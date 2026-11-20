import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchesArchetype, matchupBand, matchupOrder, shortArchetypeLabel,
} from '../src/features/standardMatchupsOpenModel';
import type { PublicStandardMatchupsArchetype } from '../src/modules/standardMatchups/public';

const archetype = (label: string, winrate: number | null): PublicStandardMatchupsArchetype => ({
  name: label, label, slug: null, classKey: null, popularity: null, games: 1000, winrate,
});
const ARCHETYPES = [archetype('Зоо Чернокнижник', 52), archetype('Ёж Друид', null), archetype('Аяя Разбойник', 57), archetype('Квест Жрец', 47)];

test('a column head drops the class the icon already names', () => {
  assert.equal(shortArchetypeLabel("К'тун Охотник на демонов", 'demonhunter'), "К'тун");
  assert.equal(shortArchetypeLabel('Зоо Чернокнижник', 'warlock'), 'Зоо');
  assert.equal(shortArchetypeLabel('Рыцарь смерти на возвещении', 'deathknight'), 'на возвещении');
  assert.equal(shortArchetypeLabel('Охотник на демонов', 'demonhunter'), 'Охотник на демонов', 'a bare class name stays whole');
  assert.equal(shortArchetypeLabel('ДК Крови', 'deathknight'), 'ДК Крови', 'a name without the class stays');
  assert.equal(shortArchetypeLabel('Ursol Паладин', null), 'Ursol Паладин', 'no class: the full name');
});

test('the heat has five steps and no step for a pair without a rate', () => {
  const band = (winrate: number | null) => matchupBand({ winrate, games: 10 });
  assert.deepEqual([60, 56, 54, 52, 50, 48, 46, 44, 30].map(band), ['ss', 'ss', 's', 's', 'e', 'w', 'w', 'ww', 'ww']);
  assert.equal(band(null), undefined);
  assert.equal(matchupBand(null), undefined);
});

test('the order: the server order, the winrate with the unknown last, the name; reversed each flips', () => {
  assert.deepEqual(matchupOrder(ARCHETYPES, 'popularity', false), [0, 1, 2, 3]);
  assert.deepEqual(matchupOrder(ARCHETYPES, 'popularity', true), [3, 2, 1, 0]);
  assert.deepEqual(matchupOrder(ARCHETYPES, 'winrate', false), [2, 0, 3, 1]);
  assert.deepEqual(matchupOrder(ARCHETYPES, 'winrate', true), [3, 0, 2, 1], 'the unknown stays last when flipped');
  assert.deepEqual(matchupOrder(ARCHETYPES, 'name', false), [2, 1, 0, 3], 'Russian alphabet, ё after е');
  assert.deepEqual(matchupOrder(ARCHETYPES, 'name', true), [3, 0, 1, 2]);
});

test('the search takes words in any order, any case, ё as е', () => {
  assert.equal(matchesArchetype(ARCHETYPES[0], 'чернокнижник зоо'), true);
  assert.equal(matchesArchetype(ARCHETYPES[1], 'еж'), true);
  assert.equal(matchesArchetype(ARCHETYPES[2], 'ЖРЕЦ'), false);
  assert.equal(matchesArchetype(ARCHETYPES[3], '  '), true);
});
