import assert from 'node:assert/strict';
import {
  addDraftCard,
  buildCurveSnapshot,
  createEmptyDraftState,
  groupDraftDeck,
  hydrateDraftState,
  removeDraftCardCopy,
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

console.log('arena draft assistant UI model tests passed');
