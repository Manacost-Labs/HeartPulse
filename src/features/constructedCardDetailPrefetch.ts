import type {
  ConstructedCardPeriod,
  ConstructedCardRank,
  ConstructedCardStatsFormat,
} from './constructedCardPeriods';

import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';

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
    const result = {
      ok: response.ok,
      status: response.status,
      payload: await response.json().catch(() => ({})),
    };
    if (!response.ok) detailRequests.delete(key);
    return result;
  }).catch(error => {
    detailRequests.delete(key);
    throw error;
  });

  detailRequests.set(key, { expiresAt: now + DETAIL_PREFETCH_TTL_MS, promise });
  return promise;
}
