import assert from 'node:assert/strict';
import {
  createConstructedCardCatalogQuery,
  type ConstructedCardCatalogQueryInput,
  type ConstructedCardCatalogQueryRecord,
  type ConstructedCatalogCard,
} from '../server/modules/constructedCards/public.js';
import { isPublicConstructedTerm } from '../shared/constructedCardTranslations.js';
import {
  cardMechanics as legacyCardMechanics,
  constructedCardFacetCounts as legacyConstructedCardFacetCounts,
  constructedCardFacets as legacyConstructedCardFacets,
  queryConstructedCards as legacyQueryConstructedCards,
} from '../server/constructedCardRoutes.js';

const {
  cardMechanics,
  constructedCardFacetCounts,
  constructedCardFacets,
  queryConstructedCards,
} = createConstructedCardCatalogQuery({ isPublicTerm: isPublicConstructedTerm });

interface TypedQueryCard {
  card_id: string;
  name: { ru: string; en: string };
  mana_cost: number;
}

const typedQueryCards: TypedQueryCard[] = [
  { card_id: 'TYPED_CARD', name: { ru: 'Типовая', en: 'Typed' }, mana_cost: 1 },
];
const typedQueryRecord: ConstructedCardCatalogQueryRecord = typedQueryCards[0];
const typedQueryResult = queryConstructedCards(typedQueryCards, { mana: 1 });
const typedQueryCardId: string = typedQueryResult[0].card_id;
assert.equal(typedQueryCardId, 'TYPED_CARD');
assert.equal(typedQueryRecord.card_id, 'TYPED_CARD');

const typoQuery: ConstructedCardCatalogQueryInput = {
  // @ts-expect-error Canonical queries reject misspelled filter names.
  clas: 'MAGE',
};
void typoQuery;

const cards = [
  {
    card_id: 'MAGE_NEW',
    slug: 'alpha-mage',
    name: { ru: 'Альфа', en: 'Alpha' },
    card_set: 'ESCAPEFROM_VIOLET_HOLD',
    card_type: { slug: 'MINION' },
    class: 'MAGE',
    multi_class: ['MAGE', 5],
    rarity: 'LEGENDARY',
    mana_cost: 3,
    attack: 3,
    health: 4,
    minion_type: 'BEAST',
    minion_types: ['BEAST', 'DRAGON'],
    spell_school: null,
    mechanics: ['BATTLECRY', 'TRIGGER_VISUAL', '5'],
    referenced_tags: ['TAUNT', 'ImmuneToSpellpower', 'TAUNT'],
    stats: { deckPopularity: 4, deckWinrate: 52, timesPlayed: 200 },
  },
  {
    card_id: 'NEUTRAL_UNKNOWN',
    slug: 'beta-neutral',
    name: { ru: 'Бета', en: 'Beta' },
    card_set: 'UNKNOWN_FUTURE_SET',
    card_type: { slug: 'MINION' },
    class: 'NEUTRAL',
    multi_class: [],
    rarity: 'COMMON',
    mana_cost: 12,
    attack: 8,
    health: 8,
    minion_type: 'MECH',
    minion_types: [],
    spell_school: null,
    mechanics: ['TAUNT'],
    referenced_tags: [],
    stats: null,
  },
  {
    card_id: 'WARRIOR_OLD',
    slug: 'gamma-warrior',
    name: { ru: 'Гамма', en: 'Gamma' },
    card_set: 'TITANS',
    card_type: { slug: 'SPELL' },
    class: 'WARRIOR',
    multi_class: [],
    rarity: 'RARE',
    mana_cost: 5,
    attack: null,
    health: null,
    minion_type: null,
    minion_types: [],
    spell_school: 'FIRE',
    mechanics: [],
    referenced_tags: [],
    stats: { deckPopularity: 1, deckWinrate: null, timesPlayed: 50 },
  },
] satisfies ConstructedCatalogCard[];

const cardIds = (items: readonly ConstructedCatalogCard[]) => items.map(card => card.card_id);
const originalOrder = cardIds(cards);

assert.deepEqual(cardIds(queryConstructedCards(cards, { query: 'альф' })), ['MAGE_NEW']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { query: 'ALPHA' })), ['MAGE_NEW']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { query: 'mage_new' })), ['MAGE_NEW']);
assert.deepEqual(cardIds(queryConstructedCards([
  { ...cards[0], card_id: 'YO_CARD', name: { ru: 'Ёлка', en: 'Fir Tree' } },
], { query: '  ЁЛК  ' })), ['YO_CARD']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { class: 'mage', mechanic: 'battlecry' })), ['MAGE_NEW']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { class: 'neutral' })), ['NEUTRAL_UNKNOWN']);
assert.deepEqual(
  cardIds(queryConstructedCards(cards, { deckClass: 'mage' })),
  ['NEUTRAL_UNKNOWN', 'MAGE_NEW'],
  'deck class filtering must retain neutral cards',
);
assert.deepEqual(
  cardIds(queryConstructedCards(cards, { deckClass: 'unknown-class' })),
  ['NEUTRAL_UNKNOWN'],
  'an unknown deck class currently retains only neutral cards',
);
assert.deepEqual(cardIds(queryConstructedCards(cards, { class: 'unknown-class' })), []);
assert.deepEqual(cardIds(queryConstructedCards(cards, { set: 'titans' })), ['WARRIOR_OLD']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { minionType: 'dragon' })), ['MAGE_NEW']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { spellSchool: 'fire' })), ['WARRIOR_OLD']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { type: 'spell', rarity: 'rare' })), ['WARRIOR_OLD']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { mechanic: 'taunt' })), ['NEUTRAL_UNKNOWN', 'MAGE_NEW']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { mechanic: 'TRIGGER_VISUAL' })), []);
assert.deepEqual(cardIds(queryConstructedCards(cards, { mana: '10+' })), ['NEUTRAL_UNKNOWN']);
assert.deepEqual(cardIds(queryConstructedCards(cards, { mana: '3', attack: '3', health: '4' })), ['MAGE_NEW']);
assert.deepEqual(
  cardIds(queryConstructedCards(cards, { attack: '0' })),
  ['WARRIOR_OLD'],
  'an explicit null numeric field currently matches the zero filter',
);

const multiClassCard = {
  ...cards[2],
  card_id: 'WARRIOR_MAGE',
  multi_class: ['MAGE'],
};
assert.deepEqual(
  cardIds(queryConstructedCards([cards[0], cards[1], multiClassCard], { deckClass: 'mage' })),
  ['NEUTRAL_UNKNOWN', 'MAGE_NEW', 'WARRIOR_MAGE'],
);

const fallbackQuery: ConstructedCardCatalogQueryInput = {
  mana: 'not-a-number',
  sort: 'not-a-sort',
  direction: 'sideways',
};
assert.deepEqual(
  cardIds(queryConstructedCards(cards, fallbackQuery)),
  ['NEUTRAL_UNKNOWN', 'MAGE_NEW', 'WARRIOR_OLD'],
  'invalid numeric filters must be ignored and invalid sorting must use release order',
);
assert.deepEqual(
  cardIds(queryConstructedCards(cards, { sort: 'popularity', direction: 'desc' })),
  ['MAGE_NEW', 'WARRIOR_OLD', 'NEUTRAL_UNKNOWN'],
  'missing numeric statistics must remain after finite values in descending order',
);
assert.deepEqual(
  cardIds(queryConstructedCards(cards, { sort: 'popularity', direction: 'asc' })),
  ['WARRIOR_OLD', 'MAGE_NEW', 'NEUTRAL_UNKNOWN'],
);
assert.deepEqual(
  cardIds(queryConstructedCards(cards, { sort: 'winrate', direction: 'asc' })),
  ['WARRIOR_OLD', 'MAGE_NEW', 'NEUTRAL_UNKNOWN'],
  'an explicit null metric currently sorts as zero while an absent metric sorts last',
);
assert.deepEqual(cardIds(cards), originalOrder, 'catalog queries must not mutate source ordering');
assert.deepEqual(cardIds(queryConstructedCards([
  cards[0],
  cards[2],
  cards[1],
  { ...cards[2], card_id: 'MISSING_SET', name: { ru: 'Дельта', en: 'Delta' }, card_set: null },
], {})), ['NEUTRAL_UNKNOWN', 'MAGE_NEW', 'WARRIOR_OLD', 'MISSING_SET']);

assert.deepEqual(cardMechanics(cards[0]), ['BATTLECRY', 'TAUNT']);
assert.deepEqual(constructedCardFacets(cards), {
  classes: ['MAGE', 'NEUTRAL', 'WARRIOR'],
  sets: ['ESCAPEFROM_VIOLET_HOLD', 'TITANS', 'UNKNOWN_FUTURE_SET'],
  mechanics: ['BATTLECRY', 'TAUNT'],
  minionTypes: ['BEAST', 'DRAGON', 'MECH'],
  spellSchools: ['FIRE'],
  types: ['MINION', 'SPELL'],
  rarities: ['COMMON', 'LEGENDARY', 'RARE'],
});
assert.deepEqual(constructedCardFacetCounts(cards), {
  classes: [
    { value: 'MAGE', count: 1 },
    { value: 'NEUTRAL', count: 1 },
    { value: 'WARRIOR', count: 1 },
  ],
  sets: [
    { value: 'ESCAPEFROM_VIOLET_HOLD', count: 1 },
    { value: 'TITANS', count: 1 },
    { value: 'UNKNOWN_FUTURE_SET', count: 1 },
  ],
  mechanics: [
    { value: 'BATTLECRY', count: 1 },
    { value: 'TAUNT', count: 2 },
  ],
  minionTypes: [
    { value: 'BEAST', count: 1 },
    { value: 'DRAGON', count: 1 },
    { value: 'MECH', count: 1 },
  ],
  spellSchools: [{ value: 'FIRE', count: 1 }],
  types: [
    { value: 'MINION', count: 2 },
    { value: 'SPELL', count: 1 },
  ],
  rarities: [
    { value: 'COMMON', count: 1 },
    { value: 'LEGENDARY', count: 1 },
    { value: 'RARE', count: 1 },
  ],
});

const legacyCards = legacyQueryConstructedCards(cards, { class: 'mage' });
const legacyCardId: string = legacyCards[0].card_id;
const legacyMechanics: string[] = legacyCardMechanics(cards[0]);
const legacyFacetClasses: string[] = legacyConstructedCardFacets(cards).classes;
const legacyFacetCounts: Array<{ value: string; count: number }> = legacyConstructedCardFacetCounts(cards).classes;
assert.equal(legacyCardId, 'MAGE_NEW');
assert.deepEqual(legacyMechanics, cardMechanics(cards[0]));
assert.deepEqual(legacyFacetClasses, constructedCardFacets(cards).classes);
assert.deepEqual(legacyFacetCounts, constructedCardFacetCounts(cards).classes);

console.log('constructed-card catalog query contracts passed');
