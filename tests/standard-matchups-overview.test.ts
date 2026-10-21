import assert from 'node:assert/strict';
import {
  matchupArchetypeSlug, matchupGroup, standardMatchupArchetypes, standardMatchupOverview,
} from '../src/modules/standardMatchups/model/overview';
import type { StandardMatchupsData } from '../src/modules/standardMatchups/model/types';

const data: Pick<StandardMatchupsData, 'columns' | 'rows'> = {
  columns: [
    { name: 'Quest Priest', label: 'Квест Жрец', classKey: 'priest', popularity: '26.2%' },
    { name: "C'Thun DH", label: "К'тун Охотник на демонов", classKey: 'demonhunter', popularity: '4,0%' },
    { name: 'Void DH', classKey: 'demonhunter', popularity: '1.0%' },
    { name: 'Mill Paladin', classKey: 'paladin', popularity: '0.1%' },
    { name: 'Mystery Deck', classKey: null, popularity: null },
  ],
  rows: [
    { archetype: 'Quest Priest', archetypeLabel: 'Квест Жрец', classKey: 'priest', winrate: 56.6, cells: [
      { opponent: 'Quest Priest', winrate: 50 },
      { opponent: "C'Thun DH", winrate: 61 },
      { opponent: 'Void DH', winrate: 41 },
      { opponent: 'Mill Paladin', winrate: 30 },
      { opponent: 'Mystery Deck', winrate: null },
    ] },
    { archetype: "C'Thun DH", winrate: 47, cells: [{ opponent: 'Quest Priest', winrate: 39 }] },
  ],
};
const labelOf = (name: string, label?: string) => label ?? `ru:${name}`;

assert.equal(matchupArchetypeSlug("C'Thun DH"), 'c-thun-dh', 'slugs follow the server rule');
assert.equal(matchupArchetypeSlug('—'), null);
assert.deepEqual([52, 51.9, 48, 47.9].map(matchupGroup), ['strong', 'even', 'even', 'weak']);

assert.deepEqual(standardMatchupArchetypes(data, labelOf)[1], {
  id: "C'Thun DH", label: "ru:C'Thun DH", classKey: 'demonhunter', share: 4, winrate: 47, slug: 'c-thun-dh',
}, 'a row takes its share and class from its column; a decimal comma parses');

const overview = standardMatchupOverview(data, 'Quest Priest', labelOf);
assert.ok(overview);
assert.deepEqual(overview.opponents.map(opponent => [opponent.id, opponent.vs, opponent.group, opponent.confidence]), [
  ["C'Thun DH", 61, 'strong', 'high'],
  ['Void DH', 41, 'weak', 'high'],
  ['Mill Paladin', 30, 'weak', 'low'],
], 'mirror and unpublished pairs are left out; the rest sorted best first');
assert.equal(overview.best?.id, "C'Thun DH");
assert.equal(overview.worst?.id, 'Void DH', 'a low-confidence pair is not the headline worst while trusted ones exist');
assert.deepEqual(overview.classes, [
  // (61 × 4 + 41 × 1) / 5
  { classKey: 'demonhunter', winrate: 57, opponents: 2 },
  { classKey: 'paladin', winrate: 30, opponents: 1 },
], 'a class average weighs its archetypes by their share of games');

const lone = standardMatchupOverview(data, "C'Thun DH", labelOf);
assert.equal(lone?.best?.id, 'Quest Priest');
assert.equal(lone?.worst, null, 'one pair is the best and has no separate worst');
const tied = standardMatchupOverview({ ...data, rows: [{ ...data.rows[0], cells: [
  { opponent: "C'Thun DH", winrate: 61 }, { opponent: 'Void DH', winrate: 61 }] }] }, 'Quest Priest', labelOf);
assert.equal(tied?.worst, null, 'a worst pair as good as the best is not shown as the worst');
assert.equal(standardMatchupOverview(data, 'Unknown', labelOf), null);

console.log('standard matchup overview model passed');
