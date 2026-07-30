import assert from 'node:assert/strict';
import {
  ArenaDraftAdvisorInputError,
  rankArenaDraftChoices,
} from '../shared/arenaDraftAdvisor.js';
import type {
  ArenaCombination,
  ArenaDraftAdvisorContext,
  ArenaSynergyCard,
} from '../shared/arenaSynergyContract.js';

function card(
  id: string,
  deckWinRate: number | null,
  cost: number | null,
  runs = 30,
): ArenaSynergyCard {
  return {
    id,
    name: `Карта ${id}`,
    cost,
    type: 'MINION',
    rarity: 'COMMON',
    deckWinRate,
    twelveWinRunQuality: 89,
    runs,
  };
}

function pair(
  left: ArenaSynergyCard,
  right: ArenaSynergyCard,
  classification: 'confirmed' | 'promising' | 'popular',
  deltaPoints: number,
  observedRuns = 20,
): ArenaCombination {
  return {
    cards: [left, right],
    observedRuns,
    expectedRuns: 10,
    supportPercent: 4,
    lift: 1.7,
    adjustedLift: 1.7,
    expectedRunQuality: 88,
    actualRunQuality: 90,
    interactionDeltaPoints: deltaPoints,
    adjustedInteractionDeltaPoints: deltaPoints,
    controlledInteractionDeltaPoints: deltaPoints,
    interactionEvidence: {
      cardARuns: 20,
      cardBRuns: 20,
      pairRuns: observedRuns,
      cardAQuality: 89,
      cardBQuality: 89,
      classBaselineQuality: 88,
    },
    matchedControl: {
      pairRuns: observedRuns,
      controlRuns: observedRuns * 2,
      pairRunQuality: 90,
      controlRunQuality: 90 - deltaPoints,
      deltaPoints,
      averageSimilarity: 0.65,
      distinctDays: 5,
      distinctPlayers: observedRuns,
      maxPlayerShare: 1 / observedRuns,
    },
    interactionSignal: deltaPoints >= 0.5 ? 'positive' : 'neutral',
    classification,
    historicalWeight: 0,
    score: classification === 'confirmed' ? 80 : classification === 'promising' ? 55 : 30,
    confidence: classification === 'confirmed'
      ? 'high'
      : classification === 'promising'
        ? 'medium'
        : 'exploratory',
    forcedPackageShare: 0,
  };
}

const partner = card('PARTNER', 55, 3, 40);
const strong = card('STRONG', 59, 7, 50);
const synergistic = card('SYNERGY', 58, 2, 35);
const curveFit = card('CURVE', 57, 2, 30);
const fillerCards = Array.from(
  { length: 9 },
  (_, index) => card(`FILLER_${index}`, 50 + index, 3 + (index % 4), 20 + index),
);

const baseContext: ArenaDraftAdvisorContext = {
  status: 'shadow',
  deckSize: 30,
  minimumRuns: 20,
  cards: [partner, strong, synergistic, curveFit, ...fillerCards],
  targetCurve: [
    { id: 'LOW', label: '0–2', minimumCost: 0, maximumCost: 2, targetShare: 0.4, targetCount: 12 },
    { id: 'MID', label: '3–4', minimumCost: 3, maximumCost: 4, targetShare: 0.33, targetCount: 10 },
    { id: 'HIGH', label: '5–6', minimumCost: 5, maximumCost: 6, targetShare: 0.17, targetCount: 5 },
    { id: 'TOP', label: '7+', minimumCost: 7, maximumCost: null, targetShare: 0.1, targetCount: 3 },
  ],
  pairCoverage: 1,
  limitations: ['Только успешные финальные колоды.'],
};

const confirmedResult = rankArenaDraftChoices({
  context: baseContext,
  combinations: [pair(synergistic, partner, 'confirmed', 3)],
  deckCardIds: [partner.id],
  candidateCardIds: [strong.id, synergistic.id, curveFit.id],
});

assert.equal(confirmedResult.choices.length, 3);
assert.equal(
  confirmedResult.choices[0].card.id,
  synergistic.id,
  'a close card with a confirmed interaction should outrank a slightly stronger standalone card',
);
assert.ok(confirmedResult.choices[0].components.synergy > 50);
assert.equal(confirmedResult.choices[0].synergies[0]?.partner.id, partner.id);
assert.equal(confirmedResult.choices[0].synergies[0]?.classification, 'confirmed');
assert.ok(confirmedResult.choices[0].reasons.some(reason => reason.includes('подтвержд')));

const popularResult = rankArenaDraftChoices({
  context: baseContext,
  combinations: [pair(synergistic, partner, 'popular', 4)],
  deckCardIds: [partner.id],
  candidateCardIds: [strong.id, synergistic.id, curveFit.id],
});
const withoutPairResult = rankArenaDraftChoices({
  context: baseContext,
  combinations: [],
  deckCardIds: [partner.id],
  candidateCardIds: [strong.id, synergistic.id, curveFit.id],
});
const popularChoice = popularResult.choices.find(choice => choice.card.id === synergistic.id);
const withoutPairChoice = withoutPairResult.choices.find(choice => choice.card.id === synergistic.id);
assert.ok(popularChoice && withoutPairChoice);
assert.equal(popularChoice.components.synergy, 50);
assert.equal(popularChoice.score, withoutPairChoice.score);
assert.ok(popularChoice.warnings.some(warning => warning.includes('популярн')));

const extraPartners = Array.from(
  { length: 4 },
  (_, index) => card(`PARTNER_${index}`, 54, 3, 25),
);
const cappedContext = {
  ...baseContext,
  cards: [...baseContext.cards, ...extraPartners],
  pairCoverage: 4,
};
const cappedResult = rankArenaDraftChoices({
  context: cappedContext,
  combinations: extraPartners.map(extra => pair(synergistic, extra, 'confirmed', 8)),
  deckCardIds: extraPartners.map(item => item.id),
  candidateCardIds: [strong.id, synergistic.id, curveFit.id],
});
const cappedChoice = cappedResult.choices.find(choice => choice.card.id === synergistic.id);
assert.ok(cappedChoice);
assert.equal(cappedChoice.components.synergy, 100);
assert.equal(cappedChoice.synergies.length, 3, 'only the three strongest unique partners may contribute');

const unknown = card('UNKNOWN', null, null, 1);
const unknownResult = rankArenaDraftChoices({
  context: { ...baseContext, cards: [...baseContext.cards, unknown] },
  combinations: [],
  deckCardIds: [],
  candidateCardIds: [strong.id, curveFit.id, unknown.id],
});
const unknownChoice = unknownResult.choices.find(choice => choice.card.id === unknown.id);
assert.ok(unknownChoice);
assert.equal(unknownChoice.components.base, 50);
assert.equal(unknownChoice.components.curve, 50);
assert.equal(unknownChoice.confidence, 'low');
assert.ok(unknownChoice.warnings.length >= 2);

const equalLeft = card('EQUAL_LEFT', 57.5, 3, 25);
const equalRight = card('EQUAL_RIGHT', 57.5, 3, 25);
const equalContext = {
  ...baseContext,
  cards: [...baseContext.cards, equalLeft, equalRight],
};
const equalResult = rankArenaDraftChoices({
  context: equalContext,
  combinations: [],
  deckCardIds: [],
  candidateCardIds: [equalLeft.id, equalRight.id, strong.id],
});
assert.equal(
  equalResult.choices.find(choice => choice.card.id === equalLeft.id)?.components.base,
  equalResult.choices.find(choice => choice.card.id === equalRight.id)?.components.base,
  'equal win rates must receive equal base strength regardless of card id ordering',
);

assert.throws(
  () => rankArenaDraftChoices({
    context: baseContext,
    combinations: [],
    deckCardIds: [],
    candidateCardIds: [strong.id, strong.id, curveFit.id],
  }),
  (error: unknown) => (
    error instanceof ArenaDraftAdvisorInputError
    && error.code === 'DUPLICATE_CANDIDATES'
  ),
);

assert.throws(
  () => rankArenaDraftChoices({
    context: baseContext,
    combinations: [],
    deckCardIds: Array.from({ length: 31 }, () => partner.id),
    candidateCardIds: [strong.id, synergistic.id, curveFit.id],
  }),
  (error: unknown) => (
    error instanceof ArenaDraftAdvisorInputError
    && error.code === 'DECK_TOO_LARGE'
  ),
);

console.log('arena draft advisor tests passed');
