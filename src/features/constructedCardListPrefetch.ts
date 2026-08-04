export type ConstructedCardListResponse<T> = {
  ok: boolean;
  status: number;
  payload: T;
};

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<ConstructedCardListResponse<T>>;
};

const LIST_PREFETCH_TTL_MS = 90_000;
const LIST_PREFETCH_LIMIT = 16;
const listRequests = new Map<string, CacheEntry<unknown>>();

function requestKey(url: string, statsAccess: boolean): string {
  return `${statsAccess ? 'paid' : 'public'}:${url}`;
}

function pruneExpired(now: number): void {
  for (const [key, entry] of listRequests) {
    if (entry.expiresAt <= now) listRequests.delete(key);
  }
  while (listRequests.size >= LIST_PREFETCH_LIMIT) {
    const oldest = listRequests.keys().next().value;
    if (!oldest) break;
    listRequests.delete(oldest);
  }
}

export function loadConstructedCardList<T>(
  url: string,
  statsAccess: boolean,
  options: { bust?: boolean } = {},
): Promise<ConstructedCardListResponse<T>> {
  const key = requestKey(url, statsAccess);
  const now = Date.now();
  const cached = listRequests.get(key) as CacheEntry<T> | undefined;
  if (!options.bust && cached && cached.expiresAt > now) return cached.promise;

  if (options.bust) listRequests.delete(key);
  pruneExpired(now);
  const promise = fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }).then(async response => {
    const result = {
      ok: response.ok,
      status: response.status,
      payload: await response.json().catch(() => ({} as T)),
    };
    if (!response.ok) listRequests.delete(key);
    return result;
  }).catch(error => {
    listRequests.delete(key);
    throw error;
  });

  listRequests.set(key, {
    expiresAt: now + LIST_PREFETCH_TTL_MS,
    promise: promise as Promise<ConstructedCardListResponse<unknown>>,
  });
  return promise;
}

export function prefetchConstructedCardList(
  url: string,
  statsAccess: boolean,
): Promise<void> {
  return loadConstructedCardList(url, statsAccess)
    .then(() => undefined)
    .catch(() => undefined);
}

export function initialConstructedCardCatalogUrl(format: ConstructedCardFormat): string {
  return constructedCardCatalogUrl({
    format,
    period: '1d',
    rank: 'legend',
    page: 1,
    perPage: 60,
    filters: EMPTY_CONSTRUCTED_CARD_FILTERS,
    query: '',
  });
}

/** Warm the exact request consumed by the first catalog render. */
export function prefetchInitialConstructedCardCatalog(
  format: ConstructedCardFormat,
  statsAccess: boolean,
): Promise<void> {
  return prefetchConstructedCardList(initialConstructedCardCatalogUrl(format), statsAccess);
}
import {
  constructedCardCatalogUrl,
  EMPTY_CONSTRUCTED_CARD_FILTERS,
  type ConstructedCardFormat,
} from './constructedCardCatalogModel';
