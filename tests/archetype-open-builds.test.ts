import assert from 'node:assert/strict';
import test from 'node:test';
import { openBuildAsBuild, openBuildCards, type OpenBuild } from '../src/features/archetypeOpenBuilds';
import { seededDeck } from '../src/features/deckViews/seededDeck';

const build: OpenBuild = {
  deckCode: 'AAECAf0GAfKiBALxogTzogQAAA==', games: 2216, winrate: 57.1, updatedAt: '2026-07-22T21:05:32.877Z',
  sampleRank: 'all', samplePeriod: 'past_30_days',
  cards: [
    { id: 'TST_001', name: 'Тестовый удар', cost: 1, rarity: 'LEGENDARY', count: 1, hasPage: true },
    { id: 'TIME_875t', name: 'Король Ллейн', cost: 3, rarity: null, count: 2, hasPage: false },
    { id: null, name: null, cost: null, rarity: null, count: 1, hasPage: false },
  ],
};

test('open build cards become the deck views cards: links only for catalog cards, unnamed cards left out', () => {
  const cards = openBuildCards(build, 'wild');
  assert.deepEqual(cards?.map(card => [card.name, card.count, card.rarity, card.elite, card.pagePath]), [
    ['Тестовый удар', 1, 'LEGENDARY', true, '/standard/cards/wild/TST_001/'],
    ['Король Ллейн', 2, 'COMMON', false, null],
  ]);
  assert.equal(openBuildCards({ ...build, cards: null }, 'wild'), null, 'a build whose cards could not be named has no list');
  assert.equal(openBuildCards({ ...build, cards: [] }, 'wild'), null);
});

test('a seeded deck is the payload the resolver would give, so the gallery requests nothing', () => {
  const deck = seededDeck(build.deckCode, 'standard', openBuildCards(build, 'standard') ?? []);
  assert.equal(deck.ok, true);
  assert.equal(deck.deckCode, build.deckCode);
  assert.equal(deck.totalCards, 3);
  assert.equal(deck.deckSizeLimit, 30);
  assert.deepEqual(deck.sideboards, []);
});

test('an open build is a gallery build without a source link', () => {
  assert.deepEqual(openBuildAsBuild(build), {
    deckCode: build.deckCode, games: 2216, winrate: 57.1, updatedAt: '2026-07-22T21:05:32.877Z',
    sampleRank: 'all', samplePeriod: 'past_30_days', sourceUrl: '',
  });
});
