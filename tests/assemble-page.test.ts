import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembleCardIdFromSearch, assembleFormatFromSearch, assemblePageHref, isAssembleCardData, isAssembleList, resolveAssembleCard,
} from '../src/modules/constructedCards/model/assemblePage.js';
import type { CardAssembleListData } from '../src/modules/constructedCards/model/cardAssemble.js';

const item = (cardId: string, cardClass: string, state: string): CardAssembleListData['cards'][number] => ({
  card: { cardId, dbfId: 1, name: cardId, cost: 3, cardClass, rarity: null }, state, basesTotal: 10, winRate: 50,
});
const cards = [item('BE_004', 'PALADIN', 'ok'), item('BE_044', 'NEUTRAL', 'ok'), item('BE_087', 'WARLOCK', 'no_data')];

test('the address names the format and the card; wrong values fall back', () => {
  assert.equal(assembleFormatFromSearch('wild'), 'wild');
  for (const value of ['standard', 'WILD', '', null, undefined]) assert.equal(assembleFormatFromSearch(value), 'standard');
  assert.equal(assembleCardIdFromSearch('BE_004'), 'BE_004');
  for (const value of ['', 'x', '../etc', 'BE 004', 'a'.repeat(81), null, undefined]) assert.equal(assembleCardIdFromSearch(value), null);
  assert.equal(assemblePageHref('standard', null), '/standard/assemble/');
  assert.equal(assemblePageHref('standard', 'BE_004'), '/standard/assemble/?card=BE_004');
  assert.equal(assemblePageHref('wild', 'BE_044'), '/standard/assemble/?card=BE_044&format=wild');
  assert.equal(assemblePageHref('wild', null), '/standard/assemble/?format=wild');
});

test('the shown card is the requested one, else the neutral one with data, else the first with data', () => {
  assert.equal(resolveAssembleCard(cards, 'BE_004')?.card.cardId, 'BE_004');
  assert.equal(resolveAssembleCard(cards, 'BE_087')?.card.cardId, 'BE_087', 'a card without data is shown when asked for');
  assert.equal(resolveAssembleCard(cards, 'XYZ')?.card.cardId, 'BE_044');
  assert.equal(resolveAssembleCard(cards, null)?.card.cardId, 'BE_044');
  assert.equal(resolveAssembleCard([item('BE_044', 'NEUTRAL', 'no_data'), item('BE_004', 'PALADIN', 'ok')], null)?.card.cardId, 'BE_004', 'data beats neutral');
  assert.equal(resolveAssembleCard([item('BE_087', 'WARLOCK', 'no_data')], null)?.card.cardId, 'BE_087');
  assert.equal(resolveAssembleCard([], 'BE_004'), null);
});

test('the shape guards accept only the answer for the requested format and card', () => {
  const list = { format: 'standard', checkedAt: null, stale: false, cards };
  assert.equal(isAssembleList(list, 'standard'), true);
  assert.equal(isAssembleList(list, 'wild'), false);
  assert.equal(isAssembleList({ ...list, cards: [] }, 'standard'), false);
  assert.equal(isAssembleList(null, 'standard'), false);
  const data = { cardId: 'BE_004', format: 'standard', state: 'ok', bases: [] };
  assert.equal(isAssembleCardData(data, 'standard', 'BE_004'), true);
  assert.equal(isAssembleCardData(data, 'standard', 'BE_044'), false);
  assert.equal(isAssembleCardData(data, 'wild', 'BE_004'), false);
});
