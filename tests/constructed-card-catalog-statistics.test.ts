import assert from 'node:assert/strict';
import {
  mergeConstructedCardRows as legacyMergeConstructedCardRows,
  MIN_RELIABLE_CONSTRUCTED_CARD_GAMES as legacyMinimumReliableGames,
  normalizeConstructedCardStats as legacyNormalizeConstructedCardStats,
  validateConstructedCardStatsDataset as legacyValidateConstructedCardStatsDataset,
} from '../server/constructedCardRoutes.js';
import {
  mergeConstructedCardRows,
  MIN_RELIABLE_CONSTRUCTED_CARD_GAMES,
  normalizeConstructedCardStats,
  validateConstructedCardStatsDataset,
} from '../server/modules/constructedCards/public.js';

interface LegacyCatalogCard {
  card_id: string;
  dbf: number;
  name: { ru: string };
}

interface LegacyStatisticsRow {
  id: string;
  dbfId: number;
  deck_popularity: string;
}

const legacyTypedRows = legacyMergeConstructedCardRows(
  [{ card_id: 'LEGACY_CARD', dbf: 77, name: { ru: 'Совместимая карта' } } satisfies LegacyCatalogCard],
  [{ id: 'LEGACY_CARD', dbfId: 77, deck_popularity: '7%' } satisfies LegacyStatisticsRow],
);
const legacyTypedCardId: string = legacyTypedRows[0].card_id;
const legacyTypedRussianName: string = legacyTypedRows[0].name.ru;
assert.equal(legacyTypedCardId, 'LEGACY_CARD');
assert.equal(legacyTypedRussianName, 'Совместимая карта');

assert.equal(legacyMergeConstructedCardRows, mergeConstructedCardRows);
assert.equal(legacyMinimumReliableGames, MIN_RELIABLE_CONSTRUCTED_CARD_GAMES);
assert.equal(legacyNormalizeConstructedCardStats, normalizeConstructedCardStats);
assert.equal(legacyValidateConstructedCardStatsDataset, validateConstructedCardStatsDataset);
assert.equal(MIN_RELIABLE_CONSTRUCTED_CARD_GAMES, 100);

assert.equal(normalizeConstructedCardStats(undefined), null);
assert.deepEqual(
  normalizeConstructedCardStats({
    deck_popularity: '12,5%',
    deck_winrate: '54,3%',
    avg_copies: '1.75',
    times_played: '100',
    winrate_when_played: '57.2%',
    winrate_when_drawn: '55.1%',
    keep_percentage: '43.2%',
    opening_hand_winrate: '52.4%',
    avg_turns_in_hand: '2.25',
    avg_turn_played_on: '4.5',
  }),
  {
    deckPopularity: 12.5,
    deckWinrate: 54.3,
    averageCopies: 1.75,
    timesPlayed: 100,
    winrateWhenPlayed: 57.2,
    winrateWhenDrawn: 55.1,
    keepPercentage: 43.2,
    openingHandWinrate: 52.4,
    averageTurnsInHand: 2.25,
    averageTurnPlayed: 4.5,
  },
);

assert.deepEqual(
  normalizeConstructedCardStats({
    deck_popularity: '',
    deck_winrate: '101%',
    avg_copies: 'not-a-number',
    times_played: 99,
    winrate_when_played: '60%',
    winrate_when_drawn: '60%',
    keep_percentage: '60%',
    opening_hand_winrate: '60%',
    avg_turns_in_hand: undefined,
    avg_turn_played_on: Number.POSITIVE_INFINITY,
  }),
  {
    deckPopularity: null,
    deckWinrate: null,
    averageCopies: null,
    timesPlayed: 99,
    winrateWhenPlayed: null,
    winrateWhenDrawn: null,
    keepPercentage: null,
    openingHandWinrate: null,
    averageTurnsInHand: null,
    averageTurnPlayed: null,
  },
  'samples below the reliability threshold must retain counts but suppress rates',
);
assert.equal(
  normalizeConstructedCardStats({ times_played: 100, deck_winrate: '60%' })?.deckWinrate,
  60,
  'the exact reliability threshold must preserve valid rates',
);
assert.deepEqual(
  normalizeConstructedCardStats({
    deck_popularity: '137%',
    deck_winrate: '101%',
    avg_copies: 'invalid',
    times_played: 100,
  }),
  {
    deckPopularity: null,
    deckWinrate: null,
    averageCopies: null,
    timesPlayed: 100,
    winrateWhenPlayed: null,
    winrateWhenDrawn: null,
    keepPercentage: null,
    openingHandWinrate: null,
    averageTurnsInHand: null,
    averageTurnPlayed: null,
  },
  'invalid and out-of-range source values must not reach the public model',
);

assert.throws(
  () => validateConstructedCardStatsDataset([]),
  new Error('Constructed card statistics dataset is empty'),
);
assert.throws(
  () => validateConstructedCardStatsDataset([
    { id: 'CARD_1', deck_popularity: '' },
    { id: 'CARD_2', deck_popularity: '—' },
  ]),
  new Error('Constructed card statistics have no deck popularity values'),
);
assert.throws(
  () => validateConstructedCardStatsDataset([
    { id: 'VALID', deck_popularity: '12%' },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `INVALID_${index}`, deck_popularity: 'invalid' })),
  ]),
  new Error('Constructed card statistics contain 4 invalid popularity values'),
);
assert.throws(
  () => validateConstructedCardStatsDataset(
    Array.from({ length: 10 }, (_, index) => ({ id: `EXTREME_${index}`, deck_popularity: '80%' })),
  ),
  new Error('Constructed card statistics contain 10 implausible popularity values'),
);
assert.doesNotThrow(() => validateConstructedCardStatsDataset([
  { id: 'CARD_1', deck_popularity: '23.28%' },
  { id: 'CARD_2', deck_popularity: '12,5%' },
]));

const catalogCards = [
  { card_id: 'CARD_1', dbf: 1, name: { ru: 'Альфа', en: 'Alpha' } },
  { card_id: 'CARD_2', dbf: 2, name: { ru: 'Бета', en: 'Beta' } },
  { card_id: 'CARD_3', dbf: 3, name: { ru: 'Гамма', en: 'Gamma' } },
];
const identityMergedCards = mergeConstructedCardRows(catalogCards, [
  { id: 'CARD_1', dbfId: 999, deck_popularity: '10%', times_played: 100 },
  { id: 'OTHER_CARD', dbfId: 1, deck_popularity: '20%', times_played: 100 },
  { id: 'UNKNOWN_CARD', dbfId: 2, deck_popularity: '30%', times_played: 100 },
]);
assert.equal(identityMergedCards[0].stats?.deckPopularity, 10, 'card ID must take priority over DBF identity');
assert.equal(identityMergedCards[1].stats?.deckPopularity, 30, 'DBF identity must be used as a fallback');
assert.equal(identityMergedCards[2].stats, null, 'catalog cards without statistics must remain visible');
assert.equal(identityMergedCards.length, catalogCards.length, 'represented statistics must not create extra cards');

const pendingCard = mergeConstructedCardRows([], [{
  id: 'NEW_CARD',
  dbfId: 42,
  name: 'Новая карта',
  type: 'SPELL',
  rarity: 'EPIC',
  cardClass: 'PRIEST',
  cost: 3,
  deck_popularity: '1.2%',
  times_played: 42,
}])[0];
assert.deepEqual(pendingCard, {
  card_id: 'NEW_CARD',
  dbf: 42,
  name: { ru: 'Новая карта', en: null },
  text: { ru: null, en: null },
  flavor: { ru: null, en: null },
  card_set: null,
  card_type: { slug: 'SPELL', name_ru: null },
  rarity: 'EPIC',
  class: 'PRIEST',
  multi_class: [],
  mana_cost: 3,
  attack: null,
  health: null,
  mechanics: [],
  referenced_tags: [],
  images: { card: null, golden: null, signature: null, diamond: null, crop: null },
  catalogPending: true,
  stats: {
    deckPopularity: 1.2,
    deckWinrate: null,
    averageCopies: null,
    timesPlayed: 42,
    winrateWhenPlayed: null,
    winrateWhenDrawn: null,
    keepPercentage: null,
    openingHandWinrate: null,
    averageTurnsInHand: null,
    averageTurnPlayed: null,
  },
});

assert.equal(
  mergeConstructedCardRows(catalogCards, [
    { id: 'CARD_1', dbfId: 1, deck_popularity: '2%' },
    { id: 'CARD_1', dbfId: 1, deck_popularity: '3%' },
  ]).length,
  catalogCards.length,
  'duplicate statistics rows must not create duplicate catalog cards',
);
