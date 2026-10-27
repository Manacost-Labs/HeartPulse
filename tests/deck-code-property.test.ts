import assert from 'node:assert/strict';
import test from 'node:test';
import { decode, encode } from '@firestone-hs/deckstrings';
import fc from 'fast-check';
import { buildDeckCardData, decodeDeckCardCounts } from '../server/deckCardData.js';
import {
  CONSTRUCTED_HERO_BY_DBF,
  CONSTRUCTED_HERO_DBF,
  encodeConstructedDeck,
  normalizeConstructedHeroClass,
  type ConstructedHeroClass,
} from '../src/features/constructedDeckCode.js';
import { assertProperty } from './helpers/propertyRuns.js';

// Hearthstone's own format ids inside a deck code.
const GAME_FORMAT_ID = { wild: 1, standard: 2 } as const;
// A real 30-card Mage deck: the code a player copies from the game.
const MAGE_DECK = 'AAECAa0GCJbUBM/GBc/2BdiBBqmVBsekBq+oBtfSBgvLoAS7xAX7+AWi6QXt9wX7gAbGnAbCtgaAuAamnQavqAYAAA==';

const heroClass = fc.constantFrom(...Object.keys(CONSTRUCTED_HERO_DBF) as ConstructedHeroClass[]);
const format = fc.constantFrom('standard' as const, 'wild' as const);
const card = fc.record({ dbfId: fc.integer({ min: 1, max: 10_000_000 }), count: fc.integer({ min: 1, max: 2 }) });
// A constructed deck lists 15–30 distinct cards, one or two copies each.
const deckCards = fc.uniqueArray(card, { selector: entry => entry.dbfId, minLength: 15, maxLength: 30 });

function countsByCard(cards: Array<{ dbfId: number; count: number }>): Map<number, number> {
  return new Map(cards.map(entry => [entry.dbfId, entry.count]));
}

test('a deck code the site builds opens as the same deck in the game', () => {
  assertProperty(fc.property(heroClass, format, deckCards, (hero, deckFormat, cards) => {
    const code = encodeConstructedDeck({ heroClass: hero, format: deckFormat, cards });
    const inGame = decode(code);

    assert.deepEqual(countsByCard(decodeDeckCardCounts(code)), countsByCard(cards));
    assert.equal(CONSTRUCTED_HERO_BY_DBF.get(inGame.heroes[0]), hero);
    assert.equal(inGame.format, GAME_FORMAT_ID[deckFormat]);
  }));
});

test('cards the builder cannot place never reach the deck code', () => {
  const brokenCard = fc.oneof(
    fc.record({ dbfId: fc.integer({ max: 0 }), count: fc.integer({ min: 1, max: 2 }) }),
    fc.record({ dbfId: fc.integer({ min: 10_000_001 }), count: fc.integer({ min: 1, max: 2 }) }),
    fc.record({ dbfId: fc.integer({ min: 1, max: 10_000_000 }), count: fc.integer({ max: 0 }) }),
    fc.record({ dbfId: fc.double({ noInteger: true, noDefaultInfinity: true }), count: fc.constant(1) }),
  );
  assertProperty(fc.property(heroClass, deckCards, fc.array(brokenCard, { maxLength: 5 }), (hero, cards, broken) => {
    const code = encodeConstructedDeck({ heroClass: hero, format: 'standard', cards: [...broken, ...cards] });

    assert.deepEqual(countsByCard(decodeDeckCardCounts(code)), countsByCard(cards));
  }));
});

test('a sideboard (E.T.C., Zilliax) survives the deck code', () => {
  const sideboard = fc.record({
    keyCardDbfId: fc.integer({ min: 1, max: 10_000_000 }),
    cards: fc.uniqueArray(fc.record({ dbfId: fc.integer({ min: 1, max: 10_000_000 }), count: fc.constant(1) }),
      { selector: entry => entry.dbfId, minLength: 1, maxLength: 3 }),
  });
  assertProperty(fc.property(deckCards, sideboard, (cards, board) => {
    const inGame = decode(encodeConstructedDeck({ heroClass: 'WARRIOR', format: 'standard', cards, sideboards: [board] }));

    assert.equal(inGame.sideboards?.length, 1);
    assert.equal(inGame.sideboards?.[0].keyCardDbfId, board.keyCardDbfId);
    assert.deepEqual(new Map(inGame.sideboards?.[0].cards), countsByCard(board.cards));
  }));
});

test('the deck code keeps the edge card ids and drops the impossible ones', () => {
  const code = encodeConstructedDeck({
    heroClass: 'MAGE',
    format: 'wild',
    cards: [
      { dbfId: 0, count: 2 },
      { dbfId: 1, count: 2 },
      { dbfId: 10_000_000, count: 1 },
      { dbfId: 10_000_001, count: 1 },
      { dbfId: 555, count: 0 },
      { dbfId: 556, count: 1.5 },
    ],
    sideboards: [
      { keyCardDbfId: 0, cards: [{ dbfId: 700, count: 1 }] },
      { keyCardDbfId: 102_983, cards: [] },
      { keyCardDbfId: 102_984, cards: [{ dbfId: 701, count: 1 }, { dbfId: 702, count: 0 }, { dbfId: -3, count: 1 }] },
    ],
  });

  assert.deepEqual(decode(code), {
    cards: [[1, 2], [10_000_000, 1]],
    sideboards: [{ keyCardDbfId: 102_984, cards: [[701, 1]] }],
    heroes: [637],
    format: 1,
  });
});

test('the hero class reads from the way pages and players spell it', () => {
  assert.equal(normalizeConstructedHeroClass('  Demon Hunter '), 'DEMONHUNTER');
  assert.equal(normalizeConstructedHeroClass('death-knight'), 'DEATHKNIGHT');
  assert.equal(normalizeConstructedHeroClass('Warlock'), 'WARLOCK');
  assert.equal(normalizeConstructedHeroClass(null), null);
  assert.equal(normalizeConstructedHeroClass(''), null);
  assert.equal(normalizeConstructedHeroClass('neutral'), null);
});

test('a deck code pasted with spaces or a line break shows the same cards', () => {
  assert.deepEqual(decodeDeckCardCounts(`  ${MAGE_DECK}\n`), decodeDeckCardCounts(MAGE_DECK));
  assert.equal(decodeDeckCardCounts(MAGE_DECK).length, 19);
});

test('text that is not a whole deck code shows no cards', () => {
  assert.deepEqual(decodeDeckCardCounts(`deck:${MAGE_DECK}`), []);
  assert.deepEqual(decodeDeckCardCounts(`${MAGE_DECK} ###`), []);
  // A one-card code is a valid deckstring but never a deck on a page.
  assert.deepEqual(decodeDeckCardCounts('AAECAf0EAAGgjQYAAA=='), []);
  assert.deepEqual(decodeDeckCardCounts('A'.repeat(48)), []);
  assert.deepEqual(decodeDeckCardCounts(undefined as unknown as string), []);
});

test('a deck code with impossible card entries shows only the real cards', () => {
  const code = encode({
    format: 2,
    heroes: [637],
    cards: [[120_101, 1], [120_102, 1], [120_103, 1], [120_104, 1], [120_105, 1], [120_106, 10], [120_107, 11]],
  });

  assert.deepEqual(decodeDeckCardCounts(code), [
    { dbfId: 120_101, count: 1 }, { dbfId: 120_102, count: 1 }, { dbfId: 120_103, count: 1 }, { dbfId: 120_104, count: 1 },
    { dbfId: 120_105, count: 1 }, { dbfId: 120_106, count: 10 },
  ]);
});

test('the deck list shows each catalog card with its name, cost, rarity and art', () => {
  const code = encode({
    format: 2,
    heroes: [637],
    // 120_017 and 120_018 are not in the catalog.
    cards: [[120_011, 2], [120_012, 1], [120_013, 1], [120_014, 2], [120_015, 1], [120_016, 1], [120_017, 1], [120_018, 2]],
  });
  const catalog = [
    null,
    { dbf: 0, card_id: 'ZERO' },
    { dbf: -120_012, card_id: 'NEGATIVE' },
    { dbf: 120_011, card_id: 'CORE_A', name: { ru: 'Огненный шар', en: 'Fireball' }, mana_cost: 4, rarity: 'common',
      images: { crop: 'https://cdn.test/a-crop.webp', card: 'https://cdn.test/a.png' } },
    { dbfId: 120_012, id: ' CORE_B ', name_ru: 'Ледяная стрела', cost: 2, rarity: 'legendary',
      crop_image: 'https://cdn.test/b-crop.webp', image: 'https://cdn.test/b.png' },
    { dbf: 120_013, card_id: 'CORE_C', name: { en: 'Frostbolt' }, mana_cost: 'free' },
    { dbf: 120_014, card_id: 'CORE_D', name: 'Arcane Intellect', images: {} },
    { dbf: 120_015, card_id: 'CORE_E' },
    { dbf: 120_016, card_id: '   ' },
  ];

  assert.deepEqual(buildDeckCardData(code, catalog), [
    { id: 'CORE_A', dbfId: 120_011, name: 'Огненный шар', cost: 4, rarity: 'COMMON', elite: false, count: 2,
      image: 'https://cdn.test/a-crop.webp', cardImage: 'https://cdn.test/a.png' },
    { id: 'CORE_B', dbfId: 120_012, name: 'Ледяная стрела', cost: 2, rarity: 'LEGENDARY', elite: true, count: 1,
      image: 'https://cdn.test/b-crop.webp', cardImage: 'https://cdn.test/b.png' },
    { id: 'CORE_C', dbfId: 120_013, name: 'Frostbolt', cost: 0, rarity: 'COMMON', elite: false, count: 1,
      image: 'https://art.hearthstonejson.com/v1/tiles/CORE_C.webp',
      cardImage: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/CORE_C.png' },
    { id: 'CORE_D', dbfId: 120_014, name: 'Arcane Intellect', cost: 0, rarity: 'COMMON', elite: false, count: 2,
      image: 'https://art.hearthstonejson.com/v1/tiles/CORE_D.webp',
      cardImage: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/CORE_D.png' },
    { id: 'CORE_E', dbfId: 120_015, name: 'CORE_E', cost: 0, rarity: 'COMMON', elite: false, count: 1,
      image: 'https://art.hearthstonejson.com/v1/tiles/CORE_E.webp',
      cardImage: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/CORE_E.png' },
  ]);
});
