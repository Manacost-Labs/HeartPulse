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
    packageCards?: CardSeed[];
    packageKey?: CardSeed;
    added?: Array<[CardSeed, number]>;
    discarded?: Array<[CardSeed, number]>;
  } = {},
) {
  return {
    draft_id: id,
    record: '12 - 2',
    main_class: className,
    played_at: options.playedAt ?? '2026-07-20T10:00:00Z',
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

console.log('arena synergy analysis tests passed');
