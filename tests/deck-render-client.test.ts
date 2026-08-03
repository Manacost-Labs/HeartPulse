import assert from 'node:assert/strict';
import {
  deckRenderCacheKey,
  invalidateDeckRender,
  requestDeckRender,
} from '../src/features/deckrender/deckRenderClient.js';

assert.equal(deckRenderCacheKey('AA EC', ' Deck '), 'AAEC\u0000Deck');

let fetchCount = 0;
const fetchImpl = (async () => {
  fetchCount += 1;
  await new Promise(resolve => setTimeout(resolve, 10));
  return new Response(JSON.stringify({
    ok: true,
    ready: true,
    imageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/aa/deck.jpg',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const [first, second] = await Promise.all([
  requestDeckRender('AAEC0123456789', 'Deck', fetchImpl),
  requestDeckRender('AAEC0123456789', 'Deck', fetchImpl),
]);
assert.equal(first, second);
assert.equal(fetchCount, 1, 'concurrent requests must be coalesced');

await requestDeckRender('AAEC0123456789', 'Deck', fetchImpl);
assert.equal(fetchCount, 1, 'warm memory cache must skip HTTP');

invalidateDeckRender('AAEC0123456789', 'Deck');
await requestDeckRender('AAEC0123456789', 'Deck', fetchImpl);
assert.equal(fetchCount, 2, 'explicit retry must bypass stale memory result');

console.log('Deck render client tests passed');
