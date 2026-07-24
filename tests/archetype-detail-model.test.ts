import assert from 'node:assert/strict';
import { classIconUrl, normalizeClassKey } from '../src/features/classIcons.js';
import {
  sortMulliganRows,
  type MulliganSort,
} from '../src/features/archetypeDetailModel.js';

assert.equal(normalizeClassKey('DEATH_KNIGHT'), 'deathknight');
assert.equal(normalizeClassKey(' Demon Hunter '), 'demonhunter');
assert.equal(classIconUrl('MAGE'), '/class_icon/ui/mage-64.webp');
assert.equal(classIconUrl('unknown'), '/class_icon/neutral.webp');

const rows = [
  { dbf_id: 1, card_name: 'Поздняя', hsreplay_rank: 3, keep_percentage: 40, avg_turn_played_on: 7.2 },
  { dbf_id: 2, card_name: 'Ранняя', hsreplay_rank: 2, keep_percentage: 61, avg_turn_played_on: 2.1 },
  { dbf_id: 3, card_name: 'Нет данных', hsreplay_rank: 1, keep_percentage: null, avg_turn_played_on: null },
  { dbf_id: 4, card_name: 'Средняя', hsreplay_rank: 4, keep_percentage: 61, avg_turn_played_on: 4.4 },
];

function ids(sort: MulliganSort) {
  return sortMulliganRows(rows, sort).map(row => row.dbf_id);
}

assert.deepEqual(ids({ key: 'hsreplay_rank', direction: 'asc' }), [3, 2, 1, 4]);
assert.deepEqual(ids({ key: 'keep_percentage', direction: 'desc' }), [2, 4, 1, 3]);
assert.deepEqual(ids({ key: 'avg_turn_played_on', direction: 'asc' }), [2, 4, 1, 3]);
assert.deepEqual(ids({ key: 'avg_turn_played_on', direction: 'desc' }), [1, 4, 2, 3]);

console.log('archetype detail model tests passed');
