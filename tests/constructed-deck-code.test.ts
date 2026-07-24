import assert from 'node:assert/strict';
import { decode } from '@firestone-hs/deckstrings';
import {
  CONSTRUCTED_HERO_BY_DBF,
  encodeConstructedDeck,
  normalizeConstructedHeroClass,
} from '../src/features/constructedDeckCode';
import {
  deckSizeLimit,
  isCatalogCardLegalForHero,
  totalDeckCards,
  type DeckBuilderEntry,
} from '../src/features/deckBuilderRules';
import {
  DECK_BUILDER_DRAFT_KEY,
  readDeckBuilderDraft,
  writeDeckBuilderDraft,
} from '../src/features/deckBuilderDraft';

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

const ordinaryCards = Array.from({ length: 30 }, (_, index) => ({ dbfId: index + 1, count: 1 }));
assert.equal(deckSizeLimit(ordinaryCards), 30, 'an ordinary deck must not become XL after its thirtieth card');
assert.equal(deckSizeLimit([...ordinaryCards, { dbfId: 31, count: 1 }]), 30, 'the 31st ordinary card must remain illegal');
assert.equal(deckSizeLimit([...ordinaryCards, { dbfId: 79767, count: 1 }]), 40, 'Prince Renathal must enable an XL deck');
assert.equal(totalDeckCards(ordinaryCards), 30);
assert.equal(isCatalogCardLegalForHero({ class: 'MAGE' }, 'MAGE'), true);
assert.equal(isCatalogCardLegalForHero({ class: 'NEUTRAL' }, 'MAGE'), true);
assert.equal(isCatalogCardLegalForHero({ class: 'ROGUE', multi_class: ['ROGUE', 'MAGE'] }, 'MAGE'), true);
assert.equal(isCatalogCardLegalForHero({ class: 'WARRIOR' }, 'MAGE'), false);

const draftEntry: DeckBuilderEntry = {
  id: 'CORE_CS2_023',
  dbfId: 555,
  name: 'Чародейский интеллект',
  cost: 3,
  rarity: 'COMMON',
  elite: false,
  count: 2,
  image: '',
  cardImage: '',
};
const draftValues = new Map<string, string>();
const draftStorage = {
  getItem: (key: string) => draftValues.get(key) ?? null,
  setItem: (key: string, value: string) => { draftValues.set(key, value); },
  removeItem: (key: string) => { draftValues.delete(key); },
};
assert.equal(writeDeckBuilderDraft(draftStorage, {
  heroClass: 'MAGE',
  format: 'standard',
  entries: [draftEntry],
  sideboards: [],
}), true);
assert.equal(draftValues.has(DECK_BUILDER_DRAFT_KEY), true);
assert.deepEqual(readDeckBuilderDraft(draftStorage), {
  schemaVersion: 1,
  heroClass: 'MAGE',
  format: 'standard',
  entries: [draftEntry],
  sideboards: [],
});
draftValues.set(DECK_BUILDER_DRAFT_KEY, '{"schemaVersion":1,"heroClass":"MAGE","format":"standard","entries":"bad"}');
assert.equal(readDeckBuilderDraft(draftStorage), null, 'a malformed draft must fail closed');

console.log('Constructed deck code tests passed');
