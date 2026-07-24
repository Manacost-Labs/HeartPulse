import assert from 'node:assert/strict';
import { decode } from '@firestone-hs/deckstrings';
import {
  CONSTRUCTED_HERO_BY_DBF,
  encodeConstructedDeck,
  normalizeConstructedHeroClass,
} from '../src/features/constructedDeckCode';

assert.equal(normalizeConstructedHeroClass('mage'), 'MAGE');
assert.equal(normalizeConstructedHeroClass('death_knight'), 'DEATHKNIGHT');
assert.equal(normalizeConstructedHeroClass('unknown'), null);
assert.equal(CONSTRUCTED_HERO_BY_DBF.get(637), 'MAGE');

const code = encodeConstructedDeck({
  heroClass: 'MAGE',
  format: 'standard',
  cards: [
    { dbfId: 555, count: 2 },
    { dbfId: 662, count: 2 },
    { dbfId: 695, count: 2 },
    { dbfId: -1, count: 2 },
    { dbfId: 1003, count: 0 },
  ],
});
const decoded = decode(code);

assert.equal(decoded.format, 2);
assert.deepEqual(decoded.heroes, [637]);
assert.deepEqual(
  [...decoded.cards].sort((left, right) => Number(left[0]) - Number(right[0])),
  [[555, 2], [662, 2], [695, 2]],
);

console.log('Constructed deck code tests passed');
