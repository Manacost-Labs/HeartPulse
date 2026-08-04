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
assert.equal(
  deckRenderImageRetryUrl('/api/public-resource/deckview/static/generated/deck.jpg', 2),
  '/api/public-resource/deckview/static/generated/deck.jpg?deckview_retry=2',
);

let fetchCount = 0;
const fetchImpl = (async () => {
  fetchCount += 1;
  await new Promise(resolve => setTimeout(resolve, 10));
  return new Response(JSON.stringify({
    ok: true,
    ready: true,
    imageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/aa/deck.jpg',
    previewImageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/aa/deck.preview-v1.webp',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const [first, second] = await Promise.all([
  requestDeckRender('AAEC0123456789', 'Deck', fetchImpl),
  requestDeckRender('AAEC0123456789', 'Deck', fetchImpl),
]);
assert.deepEqual(first, second);
assert.equal(first.imageUrl, '/api/public-resource/deckview/static/generated/render-cache/aa/deck.jpg');
assert.equal(first.previewImageUrl, '/api/public-resource/deckview/static/generated/render-cache/aa/deck.preview-v1.webp');
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
  (await requestDeckRender('AAEC9876543210', 'Transient Deck', transientFetch)).imageUrl,
  '/api/public-resource/deckview/static/generated/render-cache/bb/recovered.jpg',
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

let activeRequests = 0;
let peakActiveRequests = 0;
const releaseRequests: Array<() => void> = [];
const limitedFetch = (async () => {
  activeRequests += 1;
  peakActiveRequests = Math.max(peakActiveRequests, activeRequests);
  await new Promise<void>(resolve => releaseRequests.push(resolve));
  activeRequests -= 1;
  return new Response(JSON.stringify({
    ok: true,
    ready: true,
    imageUrl: 'https://api.blizzcore.ru/static/generated/limited.jpg',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
const limitedRequests = Array.from({ length: 6 }, (_, index) => (
  requestDeckRender(`AAEC-limit-${index}-123456`, `Limited ${index}`, limitedFetch)
));
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(peakActiveRequests, 3, 'only three unique renders may run concurrently');
while (releaseRequests.length) releaseRequests.shift()?.();
await new Promise(resolve => setTimeout(resolve, 0));
while (releaseRequests.length) releaseRequests.shift()?.();
await Promise.all(limitedRequests);
assert.equal(peakActiveRequests, 3);

console.log('Deck render client tests passed');
