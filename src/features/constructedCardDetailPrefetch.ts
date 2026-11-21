import type {
  ConstructedCardPeriod,
  ConstructedCardRank,
  ConstructedCardStatsFormat,
} from './constructedCardPeriods';

import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { forgetPaidCardAnswers, holdPaidCardAnswers, paidCardAnswersGeneration, refusesViewer } from '../modules/constructedCards/public';

type CardFormat = 'standard' | 'wild';

/** A card answer that has not come by now is a failure with a readable message and a retry, not an endless wait. */
export const CARD_DETAIL_DEADLINE_MS = 25_000;

export type ConstructedCardDetailRequest = {
  cardId: string;
  format: CardFormat;
  statsFormat: ConstructedCardStatsFormat;
  period: ConstructedCardPeriod;
  rank: ConstructedCardRank;
  statsAccess: boolean;
};

export type ConstructedCardDetailResponse = {
  ok: boolean;
  status: number;
  payload: Record<string, any>;
};

type CacheEntry = {
  expiresAt: number;
  promise: Promise<ConstructedCardDetailResponse>;
};

const DETAIL_PREFETCH_TTL_MS = 60_000;
const DETAIL_PREFETCH_LIMIT = 24;
const detailRequests = new Map<string, CacheEntry>();
// Every held answer goes, not only the ones asked as paid: the server answers by the session, so a request asked while
// access was being checked may hold paid numbers too.
holdPaidCardAnswers(() => detailRequests.clear());

function requestKey(request: ConstructedCardDetailRequest): string {
  return [
    request.cardId,
    request.format,
    request.statsFormat,
    request.period,
    request.rank,
    request.statsAccess ? 'paid' : 'public',
  ].join(':');
}

function pruneExpired(now: number): void {
  for (const [key, entry] of detailRequests) {
    if (entry.expiresAt <= now) detailRequests.delete(key);
  }
  while (detailRequests.size >= DETAIL_PREFETCH_LIMIT) {
    const oldest = detailRequests.keys().next().value;
    if (!oldest) break;
    detailRequests.delete(oldest);
  }
}

export function loadConstructedCardDetail(
  request: ConstructedCardDetailRequest,
): Promise<ConstructedCardDetailResponse> {
  const key = requestKey(request);
  const now = Date.now();
  const cached = detailRequests.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  pruneExpired(now);
  const generation = paidCardAnswersGeneration();
  const params = new URLSearchParams({
    format: request.format,
    statsFormat: request.statsFormat,
    period: request.period,
    rank: request.rank,
  });
  const promise = fetchWithDeadline(`/api/constructed-cards/${encodeURIComponent(request.cardId)}?${params}`, {
    deadlineMs: CARD_DETAIL_DEADLINE_MS,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }).then(async response => {
    // A refusal is known from its status: the page drops the paid numbers without waiting for the body.
    const refused = refusesViewer(response.status);
    if (refused) void response.body?.cancel().catch(() => undefined);
    const result = {
      ok: response.ok,
      status: response.status,
      payload: refused ? {} : await response.json().catch(() => ({})),
    };
    const guest = request.statsAccess && result.ok && result.payload?.statsAccess === false;
    // A paid answer started before paid answers were dropped confirms nothing: it answers as refused.
    const stale = result.ok && result.payload?.statsAccess === true && generation !== paidCardAnswersGeneration();
    // Refused, or a paid request answered as to a guest: the server no longer serves this viewer paid numbers.
    if (refused || guest) forgetPaidCardAnswers();
    if (!response.ok || stale) detailRequests.delete(key);
    if (stale) return { ok: false, status: 401, payload: {} };
    return result;
  }).catch(error => {
    detailRequests.delete(key);
    throw error;
  });

  detailRequests.set(key, { expiresAt: now + DETAIL_PREFETCH_TTL_MS, promise });
  return promise;
}
