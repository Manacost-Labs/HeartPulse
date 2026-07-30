import assert from 'node:assert/strict';
import {
  addDraftCard,
  buildCurveSnapshot,
  createEmptyDraftState,
  groupDraftDeck,
  hydrateDraftState,
  removeDraftCardCopy,
  suggestArenaDraftCandidates,
} from '../src/features/arenaDraftAssistantModel.js';
import type {
  ArenaDraftAdvisorContext,
  ArenaSynergyCard,
} from '../shared/arenaSynergyContract.js';

const cards: ArenaSynergyCard[] = [
  {
    id: 'CARD_LOW',
    name: 'Искра',
    cost: 2,
    type: 'SPELL',
    rarity: 'COMMON',
    deckWinRate: 58,
    twelveWinRunQuality: 90,
    runs: 42,
  },
  {
    id: 'CARD_MID',
    name: 'Архимаг',
    cost: 4,
    type: 'MINION',
    rarity: 'RARE',
    deckWinRate: 61,
    twelveWinRunQuality: 92,
    runs: 55,
  },
  {
    id: 'CARD_TOP',
    name: 'Ледяной дракон',
    cost: 8,
    type: 'MINION',
    rarity: 'EPIC',
    deckWinRate: 56,
    twelveWinRunQuality: 88,
    runs: 31,
  },
  {
    id: 'LEGEND_ALPHA',
    name: 'Легенда Альфа',
    cost: 5,
    type: 'MINION',
    rarity: 'LEGENDARY',
    deckWinRate: 63,
    twelveWinRunQuality: 94,
    runs: 45,
  },
  {
    id: 'LEGEND_BETA',
    name: 'Легенда Бета',
    cost: 7,
    type: 'MINION',
    rarity: 'LEGENDARY',
    deckWinRate: 61,
    twelveWinRunQuality: 92,
    runs: 38,
  },
  {
    id: 'LEGEND_GAMMA',
    name: 'Легенда Гамма',
    cost: 3,
    type: 'MINION',
    rarity: 'LEGENDARY',
    deckWinRate: 60,
    twelveWinRunQuality: 91,
    runs: 34,
  },
];

const context: ArenaDraftAdvisorContext = {
  status: 'shadow',
  deckSize: 30,
  minimumRuns: 20,
  cards,
  targetCurve: [
    { id: 'LOW', label: '0–2', minimumCost: 0, maximumCost: 2, targetShare: 0.4, targetCount: 12 },
    { id: 'MID', label: '3–4', minimumCost: 3, maximumCost: 4, targetShare: 0.33, targetCount: 10 },
    { id: 'HIGH', label: '5–6', minimumCost: 5, maximumCost: 6, targetShare: 0.17, targetCount: 5 },
    { id: 'TOP', label: '7+', minimumCost: 7, maximumCost: null, targetShare: 0.1, targetCount: 3 },
  ],
  pairCoverage: 12,
  limitations: [],
};

const empty = createEmptyDraftState('MAGE');
assert.deepEqual(empty, {
  version: 1,
  classId: 'MAGE',
  deckCardIds: [],
  candidateCardIds: ['', '', ''],
  selectedCardId: null,
});

const hydrated = hydrateDraftState({
  version: 1,
  classId: 'MAGE',
  deckCardIds: ['CARD_LOW', 'UNKNOWN', 'CARD_LOW'],
  candidateCardIds: ['CARD_MID', 'UNKNOWN', 'CARD_TOP'],
  selectedCardId: 'UNKNOWN',
}, 'MAGE', cards);
assert.deepEqual(hydrated.deckCardIds, ['CARD_LOW', 'CARD_LOW']);
assert.deepEqual(hydrated.candidateCardIds, ['CARD_MID', '', 'CARD_TOP']);
assert.equal(hydrated.selectedCardId, null);

const grouped = groupDraftDeck(['CARD_LOW', 'CARD_MID', 'CARD_LOW'], cards);
assert.deepEqual(grouped.map(row => [row.card.id, row.count]), [
  ['CARD_LOW', 2],
  ['CARD_MID', 1],
]);

const curve = buildCurveSnapshot(['CARD_LOW', 'CARD_MID', 'CARD_TOP'], context);
assert.deepEqual(curve.map(bucket => [bucket.id, bucket.count, bucket.targetCount]), [
  ['LOW', 1, 12],
  ['MID', 1, 10],
  ['HIGH', 0, 5],
  ['TOP', 1, 3],
]);

const fullDeck = Array.from({ length: 30 }, () => 'CARD_LOW');
assert.deepEqual(addDraftCard(fullDeck, 'CARD_MID', 30), fullDeck);
assert.deepEqual(addDraftCard(['CARD_LOW'], 'CARD_MID', 30), ['CARD_LOW', 'CARD_MID']);
assert.deepEqual(
  removeDraftCardCopy(['CARD_LOW', 'CARD_MID', 'CARD_LOW'], 'CARD_LOW'),
  ['CARD_LOW', 'CARD_MID'],
);

const openingSuggestions = suggestArenaDraftCandidates({
  deckCardIds: [],
  context,
  combinations: [],
});
assert.deepEqual(
  openingSuggestions,
  ['LEGEND_ALPHA', 'LEGEND_BETA', 'LEGEND_GAMMA'],
  'the opening auto-offer must use the current pool legendary bucket',
);

const laterSuggestions = suggestArenaDraftCandidates({
  deckCardIds: ['LEGEND_ALPHA'],
  context,
  combinations: [],
});
assert.ok(laterSuggestions, 'a regular pick must be available after the opening legendary');
assert.equal(
  laterSuggestions?.some(cardId => cardId.startsWith('LEGEND_')),
  false,
  'legendary cards must not be invented after the opening pick',
);

const duplicateFriendlySuggestions = suggestArenaDraftCandidates({
  deckCardIds: ['LEGEND_ALPHA', 'CARD_MID'],
  context,
  combinations: [],
});
assert.equal(
  duplicateFriendlySuggestions?.includes('CARD_MID'),
  true,
  'Arena has no constructed-style copy cap, so an existing card remains eligible',
);

assert.equal(
  suggestArenaDraftCandidates({
    deckCardIds: Array.from({ length: 30 }, () => 'CARD_LOW'),
    context,
    combinations: [],
  }),
  null,
  'a complete 30-card deck must not receive another auto-offer',
);

console.log('arena draft assistant UI model tests passed');
