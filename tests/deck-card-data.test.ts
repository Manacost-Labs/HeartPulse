import assert from 'node:assert/strict';
import { buildDeckCardData, decodeDeckCardCounts } from '../server/deckCardData.js';

const deckCode = 'AAECAa0GCJbUBM/GBc/2BdiBBqmVBsekBq+oBtfSBgvLoAS7xAX7+AWi6QXt9wX7gAbGnAbCtgaAuAamnQavqAYAAA==';
const counts = decodeDeckCardCounts(deckCode);
assert.ok(counts.length > 0, 'a valid Hearthstone deckstring must decode');
assert.ok(counts.every(card => card.dbfId > 0 && card.count > 0));
assert.deepEqual(decodeDeckCardCounts('not-a-deck'), []);

const first = counts[0];
const cards = buildDeckCardData(deckCode, [{
  card_id: 'TEST_CARD', dbf: first.dbfId, name: { ru: 'Тестовая карта', en: 'Test Card' },
  mana_cost: 3, rarity: 'LEGENDARY', images: { crop: 'https://example.test/crop.webp', card: 'https://example.test/card.webp' },
}]);
assert.deepEqual(cards, [{
  id: 'TEST_CARD', dbfId: first.dbfId, name: 'Тестовая карта', cost: 3, rarity: 'LEGENDARY', elite: true,
  count: first.count, image: 'https://example.test/crop.webp', cardImage: 'https://example.test/card.webp',
}]);

console.log('deck card data tests passed');
