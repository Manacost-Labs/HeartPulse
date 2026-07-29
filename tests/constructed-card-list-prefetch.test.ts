import assert from 'node:assert/strict';
import {
  loadConstructedCardList,
} from '../src/features/constructedCardListPrefetch';

const originalFetch = globalThis.fetch;
let calls = 0;

globalThis.fetch = async input => {
  calls += 1;
  const url = String(input);
  const failing = url.includes('failure=1');
  return new Response(JSON.stringify(failing
    ? { error: 'temporary failure' }
    : { request: url, sequence: calls }), {
    status: failing ? 503 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  const sharedUrl = '/api/constructed-cards?format=standard&period=1d&rank=legend';
  const [first, concurrent] = await Promise.all([
    loadConstructedCardList<{ request: string }>(sharedUrl, false),
    loadConstructedCardList<{ request: string }>(sharedUrl, false),
  ]);
  assert.equal(calls, 1, 'concurrent identical list requests must share one in-flight fetch');
  assert.equal(first.payload.request, sharedUrl);
  assert.equal(concurrent.payload.request, sharedUrl);

  await loadConstructedCardList(sharedUrl, true);
  assert.equal(calls, 2, 'subscriber and public list payloads must use separate cache entries');

  const failingUrl = '/api/constructed-cards?failure=1';
  assert.equal((await loadConstructedCardList(failingUrl, false)).status, 503);
  assert.equal((await loadConstructedCardList(failingUrl, false)).status, 503);
  assert.equal(calls, 4, 'failed list requests must be evicted so retry remains possible');

  for (let index = 0; index < 17; index += 1) {
    await loadConstructedCardList(`/api/constructed-cards?cache-entry=${index}`, false);
  }
  const callsBeforeOldestRetry = calls;
  await loadConstructedCardList(sharedUrl, false);
  assert.equal(calls, callsBeforeOldestRetry + 1, 'the bounded cache must evict its oldest entry');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('constructed-card list prefetch cache contracts passed');
