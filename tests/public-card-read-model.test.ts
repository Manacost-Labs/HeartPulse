import assert from 'node:assert/strict';
import express from 'express';
import { projectPublicConstructedCardSeoData } from '../server/constructedCardSeoRoutes';
import { once } from 'node:events';
import { createConstructedCardReader, createPublicCardRouter, type ConstructedCardCollection } from '../server/modules/constructedCards/public';

const card = { card_id: 'blizzard:12345', name: { ru: 'Публичная карта' }, class: 'MAGE', dbf: 12345,
  stats: { secret: 'PRIVATE_STATS' }, decks: [{ deckCode: 'PRIVATE_DECK' }], subscription: 'PRIVATE_ACCOUNT' };
let collection: ConstructedCardCollection = {
  cards: [card], updatedAt: null, sourceUrl: '', cacheSource: 'fresh', dataStatus: 'fresh', partial: false,
  datasetVersion: 'test', catalogVerifiedAt: null, catalogPublishedAt: null,
};
let detailCalls = 0;
const reader = createConstructedCardReader({
  loadCards: async () => collection,
  loadCardDetail: async () => { detailCalls++; return null; },
});
const app = express();
app.use(createPublicCardRouter(reader, projectPublicConstructedCardSeoData));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
try {
  for (const headers of [{}, { Cookie: 'session=fixture', Authorization: 'Bearer fixture' }]) {
    const response = await fetch(`${origin}/api/public/constructed-cards/standard/blizzard%3A12345`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.doesNotMatch(body, /PRIVATE_|subscription|deckCode|stats/);
    assert.equal(JSON.parse(body).card.id, card.card_id);
  }
  const calls = detailCalls;
  assert.equal((await fetch(`${origin}/api/public/constructed-cards/wild/ABSENT_CARD`)).status, 404);
  assert.equal(detailCalls, calls);
  collection = { ...collection, dataStatus: 'stale', cacheSource: 'LKG' };
  assert.equal((await fetch(`${origin}/api/public/constructed-cards/wild/ABSENT_CARD`)).status, 503);
  collection = { ...collection, cards: [card, card] };
  assert.equal((await fetch(`${origin}/api/public/constructed-cards/standard/blizzard%3A12345`)).status, 503);
  assert.equal((await fetch(`${origin}/api/public/constructed-cards/classic/blizzard%3A12345`)).status, 404);
  assert.equal((await fetch(`${origin}/api/public/constructed-cards/standard/blizzard%253A12345`)).status, 404);
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
const slow = createConstructedCardReader({ loadCards: () => new Promise(() => {}), loadCardDetail: async () => null, catalogTimeoutMs: 5 });
await assert.rejects(slow('standard', card.card_id), /deadline/);
console.log('public card read model assertions passed');
