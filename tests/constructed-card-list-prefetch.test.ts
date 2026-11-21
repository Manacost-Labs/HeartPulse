import assert from 'node:assert/strict';
import {
  initialConstructedCardCatalogUrl,
  loadConstructedCardList,
  prefetchInitialConstructedCardCatalog,
} from '../src/features/constructedCardListPrefetch';
import { loadConstructedCardDetail } from '../src/features/constructedCardDetailPrefetch';
import { forgetPaidCardAnswers } from '../src/features/constructedCardPaidAnswers';

const originalFetch = globalThis.fetch;
let calls = 0;

globalThis.fetch = async input => {
  calls += 1;
  const url = String(input);
  const failing = url.includes('failure=1');
  const refused = url.includes('refused=1');
  return new Response(JSON.stringify(failing || refused
    ? { error: refused ? 'Статистика доступна по подписке' : 'temporary failure' }
    // The server answers by the session: this one serves paid numbers except to the `guest=1` request.
    : { request: url, sequence: calls, statsAccess: !url.includes('guest=1') }), {
    status: refused ? 401 : failing ? 503 : 200,
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

  assert.equal(
    initialConstructedCardCatalogUrl('standard'),
    '/api/constructed-cards?format=standard&period=1d&rank=platinum&page=1&perPage=60&sort=set&direction=asc',
    'navigation warming must target the exact first catalog request',
  );
  await prefetchInitialConstructedCardCatalog('standard', false);
  assert.equal(calls, 3, 'warming the cards navigation must start the first catalog request');

  const failingUrl = '/api/constructed-cards?failure=1';
  assert.equal((await loadConstructedCardList(failingUrl, false)).status, 503);
  assert.equal((await loadConstructedCardList(failingUrl, false)).status, 503);
  assert.equal(calls, 5, 'failed list requests must be evicted so retry remains possible');

  for (let index = 0; index < 17; index += 1) {
    await loadConstructedCardList(`/api/constructed-cards?cache-entry=${index}`, false);
  }
  const callsBeforeOldestRetry = calls;
  await loadConstructedCardList(sharedUrl, false);
  assert.equal(calls, callsBeforeOldestRetry + 1, 'the bounded cache must evict its oldest entry');

  // A held answer is shown only while access is confirmed: a refusal by a card route drops every one of them, of every
  // card and slice (lists and details), the ones asked as public too (the server answers by the session).
  const paidList = '/api/constructed-cards?format=standard&period=3d&rank=legend';
  const detail = { cardId: 'CARD_A', format: 'standard', statsFormat: 'standard', period: '1d', rank: 'platinum' } as const;
  await loadConstructedCardList(paidList, true);
  await loadConstructedCardList(paidList, false);
  await loadConstructedCardDetail({ ...detail, statsAccess: true });
  const held = calls;
  await loadConstructedCardList(paidList, true);
  await loadConstructedCardDetail({ ...detail, statsAccess: true });
  assert.equal(calls, held, 'paid answers are held while nothing refused the viewer');
  assert.equal((await loadConstructedCardList('/api/constructed-cards?refused=1', true)).status, 401);
  const refusedAt = calls;
  await loadConstructedCardList(paidList, true);
  await loadConstructedCardDetail({ ...detail, statsAccess: true });
  assert.equal(calls, refusedAt + 2, 'after a refusal the paid list and detail are asked again');
  await loadConstructedCardList(paidList, false);
  assert.equal(calls, refusedAt + 3, 'the answer asked as public is asked again too');

  // A paid request answered as to a guest (`statsAccess: false`: the subscription ended) drops them as well.
  const beforeGuest = calls;
  await loadConstructedCardList(paidList, true);
  assert.equal(calls, beforeGuest, 'held again after the new answer');
  assert.equal((await loadConstructedCardList<{ statsAccess?: boolean }>('/api/constructed-cards?guest=1', true)).payload.statsAccess, false,
    'the guest answer itself reaches the page as it is');
  const guestAt = calls;
  await loadConstructedCardList(paidList, true);
  assert.equal(calls, guestAt + 1, 'after a guest answer the paid list is asked again');

  // An access that is not confirmed drops them too, and a paid answer still on its way then confirms nothing.
  const onTheWay = loadConstructedCardDetail({ ...detail, period: '7d', statsAccess: true });
  forgetPaidCardAnswers();
  assert.equal((await onTheWay).status, 401, 'a paid answer started before the access went answers as refused');
  const forgottenAt = calls;
  await loadConstructedCardDetail({ ...detail, statsAccess: true });
  assert.equal(calls, forgottenAt + 1, 'the held paid detail is asked again');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('constructed-card list prefetch cache contracts passed');
