import assert from 'node:assert/strict';
import {
  deckRenderCacheKey,
  deckRenderImageRetryUrl,
  invalidateDeckRender,
  requestFreshDeckRender,
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

let freshRequestBody: Record<string, unknown> | null = null;
const freshFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  freshRequestBody = JSON.parse(String(init?.body || '{}'));
  return new Response(JSON.stringify({
    ok: true,
    ready: true,
    imageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/cc/fresh.jpg',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
await requestFreshDeckRender('AAEC-fresh-123456', 'Fresh Deck', freshFetch);
assert.deepEqual(freshRequestBody, {
  deckCode: 'AAEC-fresh-123456',
  deckName: 'Fresh Deck',
  refresh: true,
}, 'asset recovery must explicitly bypass the persisted server preview cache');

const concurrentRequestBodies: Array<Record<string, unknown>> = [];
const concurrentFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
  concurrentRequestBodies.push(body);
  return new Response(JSON.stringify({
    ok: true,
    ready: true,
    imageUrl: body.refresh
      ? 'https://api.blizzcore.ru/static/generated/render-cache/dd/fresh.jpg'
      : 'https://api.blizzcore.ru/static/generated/render-cache/dd/stale.jpg',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
const normalRequest = requestDeckRender('AAEC-concurrent-123456', 'Concurrent Deck', concurrentFetch);
const concurrentFreshRequest = requestFreshDeckRender('AAEC-concurrent-123456', 'Concurrent Deck', concurrentFetch);
const [, concurrentFreshAsset] = await Promise.all([normalRequest, concurrentFreshRequest]);
assert.equal(concurrentRequestBodies.length, 2, 'fresh recovery must not reuse an ordinary pending render');
assert.equal(concurrentRequestBodies[0]?.refresh, undefined);
assert.equal(concurrentRequestBodies[1]?.refresh, true);
assert.match(concurrentFreshAsset.imageUrl, /fresh\.jpg$/);

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
