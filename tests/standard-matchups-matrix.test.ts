import assert from 'node:assert/strict';
import {
  CONFIDENCE_RANK, MATRIX_MIN_GAMES, confidenceOfRank, pairConfidence, standardMatrix,
} from '../src/modules/standardMatchups/model/matrix';
import type { StandardMatchupsData } from '../src/modules/standardMatchups/model/types';

const data: StandardMatchupsData = {
  format: 'standard', formatLabel: 'Стандарт', rank: 'legend', rankLabel: 'Легенда', source: 'hsguru',
  sourceUrl: 'https://www.hsguru.com/matchups?min_archetype_sample=100&min_matchup_sample=25&rank=legend',
  updatedAt: '2026-10-21T05:19:59Z',
  columns: [
    { name: 'Quest Priest', label: 'Квест Жрец', classKey: 'priest', popularity: '26.2%' },
    { name: 'Harold DK', label: 'Рыцарь смерти на возвещении', classKey: 'deathknight', popularity: '2.9%' },
    { name: 'Mill Paladin', classKey: 'paladin', popularity: '0.2%' },
  ],
  rows: [
    { archetype: 'Quest Priest', archetypeLabel: 'Квест Жрец', classKey: 'priest', winrate: 56.6, cells: [
      { opponent: 'Quest Priest', winrate: 50 }, { opponent: 'Harold DK', winrate: 77.1 },
      { opponent: 'Mill Paladin', winrate: 44.8 }] },
    { archetype: 'Harold DK', winrate: 47, cells: [
      { opponent: 'Quest Priest', winrate: 22.9 }, { opponent: 'Harold DK', winrate: 50 },
      { opponent: 'Mill Paladin', winrate: null }] },
    { archetype: 'Mill Paladin', winrate: 53, cells: [
      { opponent: 'Quest Priest', winrate: 55.2 }, { opponent: 'Harold DK', winrate: null },
      { opponent: 'Mill Paladin', winrate: 50 }] },
  ],
};

const matrix = standardMatrix(data, (name, label) => label ?? `ru:${name}`);
assert.deepEqual(matrix.archetypes, [
  { id: 'Quest Priest', name: 'Квест Жрец', classKey: 'priest', share: 26.2 },
  { id: 'Harold DK', name: 'ru:Harold DK', classKey: 'deathknight', share: 2.9 },
  { id: 'Mill Paladin', name: 'ru:Mill Paladin', classKey: 'paladin', share: 0.2 },
], 'rows keep the source order, Russian names, class and their column popularity');
assert.equal(matrix.minSample, 25, 'the published minimum sample comes from the source URL');
assert.deepEqual(matrix.pairs.map(pair => [pair.a, pair.b, Math.round(pair.winRate * 1000) / 1000, confidenceOfRank(pair.games)]), [
  ['Quest Priest', 'Harold DK', 0.771, 'high'],
  // A rare deck against the most popular one still meets it often: sqrt(26.2 × 0.2) ≈ 2.3.
  ['Quest Priest', 'Mill Paladin', 0.448, 'medium'],
  ['Harold DK', 'Quest Priest', 0.229, 'high'],
  ['Mill Paladin', 'Quest Priest', 0.552, 'medium'],
], 'mirrors and pairs without a published win rate are left out');

assert.equal(pairConfidence(2, 2), 'medium');
assert.equal(pairConfidence(1.9, 2), 'low');
assert.equal(pairConfidence(4, 4), 'high');
assert.equal(pairConfidence(undefined, 9), 'low', 'an archetype without popularity is never trusted');
assert.ok(CONFIDENCE_RANK.low < MATRIX_MIN_GAMES && CONFIDENCE_RANK.medium >= MATRIX_MIN_GAMES,
  'only low-confidence pairs fall under the matrix sample threshold');
assert.equal(standardMatrix({ ...data, sourceUrl: 'not a url' }, name => name).minSample, null);

console.log('standard matchup matrix adapter passed');
