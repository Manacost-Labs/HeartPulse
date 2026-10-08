import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deckCount, groupByPowerTier, powerTier, shareOfLeader, thresholdPercent, type TierDeck,
} from '../src/features/viciousGold/viciousGoldModel';

const deck = (rank: number, winrate: number): TierDeck => ({
  rank, winrate, deck: `Deck ${rank}`, deckLabel: `Колода ${rank}`,
  class: 'Mage', classLabel: 'Маг', classIcon: 'mage', build: null,
});

test('Power Tier bands follow the win-rate thresholds and keep the source order', () => {
  assert.deepEqual([52, 51.99, 50, 49.99, 47, 46.99].map(winrate => powerTier(winrate).label),
    ['Тир 1', 'Тир 2', 'Тир 2', 'Тир 3', 'Тир 3', 'Тир 4']);
  const bands = groupByPowerTier([deck(1, 54.1), deck(2, 52.4), deck(3, 48.2), deck(4, 51.2), deck(5, 47.5)]);
  assert.deepEqual(bands.map(band => [band.label, band.decks.map(item => item.rank)]),
    [['Тир 1', [1, 2]], ['Тир 2', [4]], ['Тир 3', [3, 5]]], 'empty bands are left out');
});

test('class bars are drawn against the leading class', () => {
  assert.equal(shareOfLeader(14.82, 14.82), '100%');
  assert.equal(shareOfLeader(7.41, 14.82), '50%');
  assert.equal(shareOfLeader(3, 0), '0%');
});

test('labels use Russian numbers and plurals', () => {
  assert.equal(thresholdPercent(0.5), '0,5%');
  assert.deepEqual([1, 3, 5, 21, 22, 11].map(deckCount), ['1 колода', '3 колоды', '5 колод', '21 колода', '22 колоды', '11 колод']);
});
