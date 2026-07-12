import { Router, type RequestHandler, type Response } from 'express';

type DecksData = {
  decks: any[];
  totalDecks?: number | null;
  updatedAt?: string | null;
  warning?: string;
  [key: string]: any;
};

type DecksCacheEntry = { data: DecksData; etag: string; expiresAt: number };

export type ArenaDecksCacheStore = { current: DecksCacheEntry | null };

export type ArenaDecksRouterDependencies = {
  accessGuard: RequestHandler;
  fetchDecks: (limit: number) => Promise<DecksData>;
  cache: ArenaDecksCacheStore;
  maxLimit?: number;
  cacheTtlMs?: number;
  publicCacheHeader?: string;
  staleCacheHeader?: string;
  now?: () => number;
  onFetchError?: (error: unknown) => void;
};

function parseInteger(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function classOptions(decks: any[]) {
  const classes = new Map<string, any>();
  for (const deck of decks) {
    for (const item of deck.classes ?? []) {
      if (item?.name && !classes.has(item.name)) classes.set(item.name, item);
    }
  }
  return Array.from(classes.values()).sort((left, right) => (
    String(left.name).localeCompare(String(right.name), 'ru')
  ));
}

export function shapeArenaDecksPage(data: DecksData, page: number, pageSize: number, className: string) {
  const allDecks = Array.isArray(data?.decks) ? data.decks : [];
  const filtered = className
    ? allDecks.filter(deck => (deck.classes ?? []).some((item: any) => item?.name === className))
    : allDecks;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const start = (safePage - 1) * pageSize;
  return {
    decks: filtered.slice(start, start + pageSize),
    totalDecks: data.totalDecks ?? allDecks.length,
    filteredDecks: filtered.length,
    page: safePage,
    pageSize,
    totalPages,
    activeClass: className || '',
    classOptions: classOptions(allDecks),
    updatedAt: data.updatedAt ?? null,
    source: 'arena-decks',
    sourceUrl: '',
    warning: data.warning,
  };
}

function etagToken(value: string) {
  return encodeURIComponent(value).replace(/[^a-z0-9_.~-]/gi, '_') || 'all';
}

function sendCached(response: Response, requestEtag: string | undefined, data: any, etag: string, cacheHeader: string) {
  const guarded = Boolean(response.locals.subscriptionGuarded);
  response.set('Cache-Control', guarded ? cacheHeader.replace(/^public\b/i, 'private') : cacheHeader);
  if (guarded) {
    response.vary('Cookie');
    response.vary('Authorization');
  }
  response.set('ETag', etag);
  if (requestEtag === etag) return response.status(304).end();
  return response.json(data);
}

function pageEtag(baseEtag: string, page: number, pageSize: number, className: string, stale = false) {
  return `"${baseEtag.replace(/^"|"$/g, '')}-p${page}-s${pageSize}-c${etagToken(className)}${stale ? '-stale' : ''}"`;
}

export function createArenaDecksRouter(dependencies: ArenaDecksRouterDependencies): Router {
  const router = Router();
  const maxLimit = dependencies.maxLimit ?? 500;
  const cacheTtlMs = dependencies.cacheTtlMs ?? 30 * 60 * 1000;
  const cacheHeader = dependencies.publicCacheHeader ?? 'public, max-age=3600, stale-while-revalidate=600';
  const staleHeader = dependencies.staleCacheHeader ?? 'public, max-age=300, stale-while-revalidate=600';
  const now = dependencies.now ?? Date.now;

  router.get('/decks', dependencies.accessGuard, async (request, response) => {
    const page = Math.max(1, parseInteger(request.query.page) ?? 1);
    const pageSize = Math.min(20, Math.max(1, parseInteger(request.query.pageSize) ?? 10));
    const className = String(request.query.class ?? '').trim();
    const timestamp = now();
    const cached = dependencies.cache.current;
    if (cached && cached.expiresAt > timestamp) {
      const data = shapeArenaDecksPage(cached.data, page, pageSize, className);
      return sendCached(response, request.headers['if-none-match'], data, pageEtag(cached.etag, data.page, pageSize, className), cacheHeader);
    }

    try {
      const data = await dependencies.fetchDecks(maxLimit);
      const parsedUpdatedAt = data.updatedAt ? Date.parse(data.updatedAt) : Number.NaN;
      const updatedToken = Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt.toString(36) : timestamp.toString(36);
      const etag = `"arena-decks-${updatedToken}-${data.decks.length}-${data.totalDecks ?? 0}"`;
      dependencies.cache.current = { data, etag, expiresAt: timestamp + cacheTtlMs };
      const shaped = shapeArenaDecksPage(data, page, pageSize, className);
      return sendCached(response, request.headers['if-none-match'], shaped, pageEtag(etag, shaped.page, pageSize, className), cacheHeader);
    } catch (error) {
      dependencies.onFetchError?.(error);
      const stale = dependencies.cache.current;
      if (stale) {
        const data = shapeArenaDecksPage({ ...stale.data, warning: 'stale' }, page, pageSize, className);
        return sendCached(response, request.headers['if-none-match'], data, pageEtag(stale.etag, data.page, pageSize, className, true), staleHeader);
      }
      return response.status(502).json({ error: 'Arena decks unavailable' });
    }
  });

  return router;
}
