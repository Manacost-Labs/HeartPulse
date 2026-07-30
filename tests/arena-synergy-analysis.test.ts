import assert from 'node:assert/strict';
import { analyzeArenaSynergies } from '../server/arenaSynergyAnalysis.js';

type CardSeed = { id: string; name?: string };

function card(seed: CardSeed, count = 1) {
  return {
    id: seed.id,
    card_id: seed.id,
    name: seed.name ?? seed.id,
    count,
    cost: 2,
    type: 'MINION',
    rarity: 'COMMON',
  };
}

function deck(
  id: string,
  className: string,
  cards: CardSeed[],
  options: {
    playedAt?: string;
    record?: '12 - 0' | '12 - 1' | '12 - 2';
    player?: string;
    packageCards?: CardSeed[];
    packageKey?: CardSeed;
    added?: Array<[CardSeed, number]>;
    discarded?: Array<[CardSeed, number]>;
  } = {},
) {
  return {
    draft_id: id,
    record: options.record ?? '12 - 2',
    main_class: className,
    played_at: options.playedAt ?? '2026-07-20T10:00:00Z',
    player: options.player ?? `player-${id}`,
    final_deck: cards.map(item => card(item)),
    package_cards: (options.packageCards ?? []).map(item => card(item)),
    package_key_card_id: options.packageKey?.id ?? null,
    added: (options.added ?? []).map(([item, count]) => card(item, count)),
    discarded: (options.discarded ?? []).map(([item, count]) => card(item, count)),
  };
}

const A = { id: 'A', name: 'Альфа' };
const B = { id: 'B', name: 'Бета' };
const X = { id: 'X', name: 'Классовая X' };
const Y = { id: 'Y', name: 'Классовая Y' };
const P = { id: 'P', name: 'Пакет P' };
const Q = { id: 'Q', name: 'Пакет Q' };
const D = { id: 'D', name: 'Сброшенная' };
const F = { id: 'F', name: 'Заполнитель' };

const decks: unknown[] = [];
for (let index = 0; index < 20; index += 1) {
  const cards = [X, Y, F];
  if (index < 10) cards.push(A, B);
  else if (index === 10 || index === 11) cards.push(A);
  else if (index === 12 || index === 13) cards.push(B);
  if (index < 8) cards.push(P, Q);
  decks.push(deck(`mage-${index}`, 'MAGE', cards, {
    record: index < 10 ? '12 - 0' : index < 14 ? '12 - 2' : '12 - 1',
    packageCards: index < 8 ? [Q] : [],
    packageKey: index < 8 ? P : undefined,
    added: index < 3 ? [[A, 1]] : [],
    discarded: index < 2 ? [[D, 2]] : [],
  }));
}
for (let index = 0; index < 20; index += 1) {
  decks.push(deck(`hunter-${index}`, 'HUNTER', [F]));
}
decks.push(deck('old-run', 'MAGE', [A, B], {
  playedAt: '2026-06-01T10:00:00Z',
}));
decks.push(deck('mage-0', 'MAGE', [F], {
  playedAt: '2026-07-10T10:00:00Z',
}));

const cardStats = {
  source_id: 'hsreplay_arena_cards_advanced',
  fetched_at: '2026-07-21T00:00:00Z',
  data: {
    structured: {
      cards: [A, B, X, Y, P, Q, D, F].map((item, index) => ({
        ...card(item),
        win_rate: 50 + index,
      })),
    },
  },
};
const patches = {
  patches: [{
    version: '36.0',
    official_title: 'Arena update',
    official_published_at: '2026-07-01T00:00:00Z',
    sections: [{ title: 'Arena changes' }],
  }],
};

const result = analyzeArenaSynergies({
  winningDecks: {
    source_id: 'hsreplay_arena_winning_decks',
    fetched_at: '2026-07-21T00:05:00Z',
    data: { structured: { decks } },
  },
  cardStats,
  patches,
  className: 'ALL',
  now: new Date('2026-07-21T01:00:00Z'),
});

assert.equal(result.summary.runsAnalyzed, 40, 'old and duplicate runs must be removed');
assert.equal(result.summary.redraftRuns, 3);
assert.equal(result.cohort.patchVersion, '36.0');
assert.equal(result.cohort.from, '2026-07-20T10:00:00.000Z');
assert.equal(result.cohort.to, '2026-07-20T10:00:00.000Z');

const truePair = result.combinations.find(item => (
  new Set(item.cards.map(cardItem => cardItem.id)).has('A')
  && new Set(item.cards.map(cardItem => cardItem.id)).has('B')
));
assert.ok(truePair, 'a pair with excess within-class co-occurrence must be found');
assert.equal(truePair.observedRuns, 10);
assert.ok(truePair.lift >= 1.25);
assert.ok(
  truePair.actualRunQuality > truePair.expectedRunQuality,
  'the pair must outperform the conservative expectation from individual card strength',
);
assert.ok(truePair.interactionDeltaPoints > 0);
assert.equal(truePair.interactionEvidence.pairRuns, 10);
assert.equal(
  truePair.interactionEvidence.cardARuns,
  2,
  'individual strength for card A must exclude runs that already contain card B',
);
assert.equal(
  truePair.interactionEvidence.cardBRuns,
  2,
  'individual strength for card B must exclude runs that already contain card A',
);
assert.ok(truePair.interactionEvidence.cardAQuality > 0);
assert.ok(truePair.interactionEvidence.cardBQuality > 0);
assert.ok(truePair.interactionEvidence.classBaselineQuality > 0);
assert.ok(truePair.cards.every(item => item.twelveWinRunQuality != null));
assert.equal(truePair.historicalWeight, 0);
assert.equal(truePair.classification, 'promising');
assert.ok(truePair.matchedControl);
assert.ok(truePair.matchedControl.controlRuns >= 5);
assert.ok(truePair.matchedControl.averageSimilarity >= 0.2);
assert.ok(truePair.matchedControl.deltaPoints > 0);
assert.ok((truePair.controlledInteractionDeltaPoints ?? 0) > 0);

assert.equal(result.dataQuality.metrics.sourceRows, 42);
assert.equal(result.dataQuality.metrics.duplicateRuns, 1);
assert.equal(result.dataQuality.metrics.validRuns, 42);
assert.equal(result.dataQuality.status, 'healthy');
assert.equal(result.reliability.servedFrom, 'live');
assert.equal(result.reliability.sampleMode, 'warming');
assert.ok(result.draftAdvisor, 'a usable sample must expose the shadow draft context');
assert.equal(result.draftAdvisor.status, 'shadow');
assert.equal(result.draftAdvisor.deckSize, 30);
assert.equal(result.draftAdvisor.minimumRuns, 12);
assert.ok(result.draftAdvisor.cards.some(item => item.id === A.id));
assert.ok(result.draftAdvisor.cards.every(item => item.runs > 0));
assert.equal(
  Math.round(result.draftAdvisor.targetCurve.reduce((sum, bucket) => sum + bucket.targetShare, 0) * 100),
  100,
);
assert.equal(result.draftAdvisor.pairCoverage, result.combinations.length);

assert.equal(
  result.combinations.some(item => item.cards.every(cardItem => cardItem.id === 'X' || cardItem.id === 'Y')),
  false,
  'cards common only because of the same class must not be called a synergy',
);
assert.equal(
  result.combinations.some(item => item.cards.every(cardItem => cardItem.id === 'P' || cardItem.id === 'Q')),
  false,
  'a pair forced by a legendary package must be filtered',
);

const added = result.redraft.find(item => item.card.id === 'A');
assert.deepEqual(
  added && {
    addedCopies: added.addedCopies,
    addedRuns: added.addedRuns,
    discardedCopies: added.discardedCopies,
    netCopies: added.netCopies,
  },
  { addedCopies: 3, addedRuns: 3, discardedCopies: 0, netCopies: 3 },
);
const discarded = result.redraft.find(item => item.card.id === 'D');
assert.deepEqual(
  discarded && {
    discardedCopies: discarded.discardedCopies,
    discardedRuns: discarded.discardedRuns,
    netCopies: discarded.netCopies,
  },
  { discardedCopies: 4, discardedRuns: 2, netCopies: -4 },
);

const mage = analyzeArenaSynergies({
  winningDecks: { data: { structured: { decks } } },
  cardStats,
  patches,
  className: 'MAGE',
});
assert.equal(mage.summary.runsAnalyzed, 20);
assert.deepEqual(mage.availableClasses, [
  { id: 'ALL', label: 'Все классы', runs: 40 },
  { id: 'MAGE', label: 'Маг', runs: 20 },
  { id: 'HUNTER', label: 'Охотник', runs: 20 },
]);

const manyDecks = Array.from({ length: 505 }, (_, index) => (
  deck(`limit-${index}`, 'MAGE', [F], {
    playedAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
  })
));
const limited = analyzeArenaSynergies({
  winningDecks: { data: { structured: { decks: manyDecks } } },
  cardStats,
  patches: { patches: [] },
  className: 'ALL',
});
assert.equal(limited.summary.runsAvailable, 505);
assert.equal(limited.summary.runsAnalyzed, 500);
assert.equal(limited.cohort.to, manyDecks[504].played_at);
assert.equal(limited.cohort.from, manyDecks[5].played_at);

const blocked = analyzeArenaSynergies({
  winningDecks: {
    fetched_at: '2026-07-21T00:05:00Z',
    data: {
      structured: {
        decks: [
          deck('valid-only', 'MAGE', [A, B, F], { player: 'same-player' }),
          { draft_id: 'bad-record', record: '11 - 3', main_class: 'MAGE' },
          { draft_id: 'bad-deck', record: '12 - 2', main_class: 'MAGE', played_at: 'not-a-date' },
        ],
      },
    },
  },
  cardStats,
  patches,
  className: 'ALL',
  now: new Date('2026-07-21T01:00:00Z'),
});
assert.equal(blocked.dataQuality.status, 'blocked');
assert.equal(blocked.dataQuality.metrics.invalidRuns, 2);
assert.ok(blocked.dataQuality.checks.some(check => check.id === 'minimum-valid-runs' && check.status === 'fail'));
assert.equal(blocked.draftAdvisor, undefined, 'an insufficient sample must not offer draft advice');

function buildMatchedControlSample(options: {
  prefix: string;
  pairRecord: '12 - 0' | '12 - 1';
  controlRecord: '12 - 1' | '12 - 2';
  concentratedPlayer?: boolean;
}) {
  const sample: unknown[] = [];
  for (let index = 0; index < 18; index += 1) {
    sample.push(deck(`${options.prefix}-pair-${index}`, 'MAGE', [A, B, X, Y, F], {
      record: options.pairRecord,
      playedAt: `2026-07-${20 + (index % 4)}T10:00:00Z`,
      player: options.concentratedPlayer ? 'one-player' : `${options.prefix}-player-${index}`,
    }));
  }
  for (let index = 0; index < 30; index += 1) {
    sample.push(deck(`${options.prefix}-control-${index}`, 'MAGE', [X, Y, F], {
      record: options.controlRecord,
      playedAt: `2026-07-${20 + (index % 4)}T11:00:00Z`,
    }));
  }
  for (let index = 0; index < 3; index += 1) {
    sample.push(deck(`${options.prefix}-a-${index}`, 'MAGE', [A, X, Y, F], {
      record: options.controlRecord,
    }));
    sample.push(deck(`${options.prefix}-b-${index}`, 'MAGE', [B, X, Y, F], {
      record: options.controlRecord,
    }));
  }
  for (let index = 0; index < 12; index += 1) {
    sample.push(deck(`${options.prefix}-other-class-${index}`, 'HUNTER', [X, Y, F], {
      record: '12 - 0',
    }));
  }
  return sample;
}

function analyzeMatchedControlSample(sampleDecks: unknown[]) {
  return analyzeArenaSynergies({
    winningDecks: { data: { structured: { decks: sampleDecks } } },
    cardStats,
    patches,
    className: 'ALL',
    now: new Date('2026-07-25T00:00:00Z'),
  }).combinations.find(item => (
    item.cards.some(cardItem => cardItem.id === A.id)
    && item.cards.some(cardItem => cardItem.id === B.id)
  ));
}

const confirmedPair = analyzeMatchedControlSample(buildMatchedControlSample({
  prefix: 'confirmed',
  pairRecord: '12 - 0',
  controlRecord: '12 - 2',
}));
assert.ok(confirmedPair);
assert.equal(confirmedPair.classification, 'confirmed');
assert.ok(confirmedPair.matchedControl);
assert.equal(confirmedPair.matchedControl.pairRuns, 18);
assert.equal(
  confirmedPair.matchedControl.controlRuns,
  36,
  'controls must exclude full-pair runs and decks from another class',
);
assert.ok(confirmedPair.matchedControl.distinctDays >= 3);
assert.ok(confirmedPair.matchedControl.distinctPlayers >= 5);
assert.ok((confirmedPair.controlledInteractionDeltaPoints ?? 0) >= 0.75);

const popularPair = analyzeMatchedControlSample(buildMatchedControlSample({
  prefix: 'popular',
  pairRecord: '12 - 1',
  controlRecord: '12 - 1',
}));
assert.ok(popularPair);
assert.equal(popularPair.classification, 'popular');
assert.equal(popularPair.controlledInteractionDeltaPoints, 0);

const concentratedPair = analyzeMatchedControlSample(buildMatchedControlSample({
  prefix: 'concentrated',
  pairRecord: '12 - 0',
  controlRecord: '12 - 2',
  concentratedPlayer: true,
}));
assert.ok(concentratedPair);
assert.notEqual(concentratedPair.classification, 'confirmed');
assert.ok(concentratedPair.matchedControl);
assert.equal(concentratedPair.matchedControl.maxPlayerShare, 1);

const historical = analyzeArenaSynergies({
  winningDecks: {
    fetched_at: '2026-07-22T00:05:00Z',
    data: { structured: { decks } },
  },
  cardStats,
  patches: {
    patches: [{
      version: '36.1',
      official_title: 'Arena update',
      official_published_at: '2026-07-19T00:00:00Z',
    }],
  },
  className: 'ALL',
  previousSnapshot: {
    savedAt: '2026-07-21T00:10:00Z',
    activeCardIds: [A.id, B.id, X.id, Y.id, P.id, Q.id, D.id, F.id],
    payload: result,
  },
  now: new Date('2026-07-22T01:00:00Z'),
});
const blendedPair = historical.combinations.find(item => (
  item.cards.some(cardItem => cardItem.id === A.id)
  && item.cards.some(cardItem => cardItem.id === B.id)
));
assert.ok(blendedPair);
assert.ok(historical.reliability.historicalWeight > 0);
assert.ok(blendedPair.historicalWeight > 0);
assert.equal(historical.reliability.previousCohortId, result.cohort.id);

console.log('arena synergy analysis tests passed');
