import assert from 'node:assert/strict';
import {
  deckRenderCacheKey,
  deckRenderImageRetryUrl,
  invalidateDeckRender,
  requestDeckRender,
} from '../src/features/deckrender/deckRenderClient.js';

assert.equal(deckRenderCacheKey('AA EC', ' Deck '), 'AAEC\u0000Deck');
assert.equal(
  deckRenderImageRetryUrl('https://api.blizzcore.ru/static/generated/deck.jpg', 2),
  'https://api.blizzcore.ru/static/generated/deck.jpg?deckview_retry=2',
);
assert.equal(
  deckRenderImageRetryUrl('https://api.blizzcore.ru/static/generated/deck.jpg?v=1', 1),
  'https://api.blizzcore.ru/static/generated/deck.jpg?v=1&deckview_retry=1',
);
assert.equal(
  deckRenderImageRetryUrl('https://api.blizzcore.ru/static/generated/deck.jpg', 0),
  'https://api.blizzcore.ru/static/generated/deck.jpg',
);

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

let transientFetchCount = 0;
const transientFetch = (async () => {
  transientFetchCount += 1;
  if (transientFetchCount === 1) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Не удалось собрать изображение колоды',
    }), { status: 502, headers: { 'Content-Type': 'application/json', 'Retry-After': '0' } });
  }
  return new Response(JSON.stringify({
    ok: true,
    ready: true,
    imageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/bb/recovered.jpg',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

assert.equal(
  await requestDeckRender('AAEC9876543210', 'Transient Deck', transientFetch),
  'https://api.blizzcore.ru/static/generated/render-cache/bb/recovered.jpg',
);
assert.equal(transientFetchCount, 2, 'transient render failures must recover automatically');

let invalidFetchCount = 0;
const invalidFetch = (async () => {
  invalidFetchCount += 1;
  return new Response(JSON.stringify({ ok: false, error: 'Некорректный код колоды' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;
await assert.rejects(
  requestDeckRender('AAEC-invalid-12345', 'Invalid Deck', invalidFetch),
  /Некорректный код колоды/,
);
assert.equal(invalidFetchCount, 1, 'permanent client errors must not be retried');

console.log('Deck render client tests passed');
