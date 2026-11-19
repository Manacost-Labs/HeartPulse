import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import {
  PUBLIC_TIERLIST_SOURCES, projectTierlistPublic, tierlistPublicEtag,
  type PublicTierlist, type PublicTierlistSource,
} from './tierlistPublicProjection.js';

export type TierlistCacheEntry = { data: any; etag: string; expiresAt: number };
export type TierlistDataResult = {
  data: any;
  etag: string;
  cacheSource: 'memory' | 'redis' | 'origin';
};

export type TierlistRouterDependencies = {
  accessGuard: RequestHandler;
  cache: Map<string, TierlistCacheEntry>;
  resolveSource: (source: string | undefined) => string;
  getData: (source: string, now: number, bypassCache: boolean) => Promise<TierlistDataResult>;
  present: (data: any) => any;
  loadFallback: (source: string) => { data: any; etag: string } | null;
  allowData?: (source: string, data: any) => boolean | Promise<boolean>;
  allowFallback?: (source: string, data: any) => boolean | Promise<boolean>;
  cacheHeader?: string;
  provisionalCacheHeader?: string;
  staleCacheHeader?: string;
  fallbackCacheHeader?: string;
  now?: () => number;
  onError?: (error: unknown) => void;
};

type PublicTierlistCacheEntry = { body: PublicTierlist; etag: string; expiresAt: number };
const PUBLIC_CACHE_MS = 300_000;
const PUBLIC_CACHE_HEADER = 'public, max-age=300, stale-while-revalidate=600';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

type ResolvedTierlist = { presented: unknown; etag: string; cacheControl: string; cacheSource: string };

export function createTierlistRouter(dependencies: TierlistRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=3600';
  const provisionalCacheHeader = dependencies.provisionalCacheHeader ?? 'public, max-age=300, stale-while-revalidate=300';
  const staleCacheHeader = dependencies.staleCacheHeader ?? 'public, max-age=300, stale-while-revalidate=600';
  const fallbackCacheHeader = dependencies.fallbackCacheHeader ?? 'public, max-age=21600, stale-while-revalidate=3600';
  const now = dependencies.now ?? Date.now;

  /** The dataset for a source: memory, origin, stale memory, then the last known good file; `null` when none is allowed. */
  const resolveTierlist = async (source: string, bypassCache: boolean): Promise<ResolvedTierlist | null> => {
    const timestamp = now();
    const cached = dependencies.cache.get(source);
    const dataAllowed = async (data: any): Promise<boolean> => {
      if (!dependencies.allowData) return true;
      try {
        return await dependencies.allowData(source, data);
      } catch (guardError) {
        dependencies.onError?.(guardError);
        return false;
      }
    };
    const answer = (data: unknown, etag: string, cacheControl: string, cacheSource: string): ResolvedTierlist => {
      const presented = dependencies.present(data);
      return { presented, etag, cacheSource, cacheControl: record(presented).provisional === true ? provisionalCacheHeader : cacheControl };
    };

    if (!bypassCache && cached && cached.expiresAt > timestamp && await dataAllowed(cached.data)) {
      return answer(cached.data, cached.etag, cacheHeader, 'memory');
    }

    try {
      const result = await dependencies.getData(source, timestamp, bypassCache);
      if (!await dataAllowed(result.data)) throw new Error('Tierlist publication policy rejected provisional data');
      return answer(result.data, result.etag, cacheHeader, result.cacheSource);
    } catch (error) {
      dependencies.onError?.(error);
      if (cached && await dataAllowed(cached.data)) {
        return answer({ ...cached.data, warning: 'stale' }, cached.etag, staleCacheHeader, 'memory-stale');
      }

      const fallback = dependencies.loadFallback(source);
      let fallbackAllowed = Boolean(fallback);
      if (fallback) {
        try {
          fallbackAllowed = dependencies.allowFallback
            ? await dependencies.allowFallback(source, fallback.data)
            : await dataAllowed(fallback.data);
        } catch (guardError) {
          dependencies.onError?.(guardError);
          fallbackAllowed = false;
        }
      }
      if (fallback && fallbackAllowed) {
        return answer({ ...fallback.data, warning: 'fallback' }, fallback.etag, fallbackCacheHeader, 'fallback');
      }
      return null;
    }
  };

  router.get('/tierlist', dependencies.accessGuard, async (request, response) => {
    const source = dependencies.resolveSource(request.query.source as string | undefined);
    const bypassCache = request.query.t !== undefined || request.query.bust === '1';
    const resolved = await resolveTierlist(source, bypassCache);
    if (!resolved) return response.status(502).json({ error: 'Tierlist unavailable' });
    return sendDatasetJsonCached(request, response, resolved.presented, resolved.etag, resolved.cacheControl, resolved.cacheSource);
  });

  // No access guard: the open layer for guests and robots. It never bypasses
  // the cache (a guest cannot fan out origin reads), keeps its own projection
  // and ETag per source, and answers 503 when no allowed dataset is left.
  const publicCache = new Map<string, PublicTierlistCacheEntry>();
  router.get('/tierlist/public', async (request, response) => {
    const requested = request.query.source;
    if (requested !== undefined && !(typeof requested === 'string' && (PUBLIC_TIERLIST_SOURCES as readonly string[]).includes(requested))) {
      return response.status(400).json({ error: 'Unknown tierlist source' });
    }
    const sourceId = (requested ?? 'hsreplay') as PublicTierlistSource;
    const timestamp = now();
    const cached = publicCache.get(sourceId);
    const send = (entry: { body: PublicTierlist; etag: string }, origin: string) =>
      sendDatasetJsonCached(request, response, entry.body, entry.etag, PUBLIC_CACHE_HEADER, origin);
    if (cached && cached.expiresAt > timestamp) return send(cached, 'memory');

    const resolved = await resolveTierlist(sourceId, false);
    const warning = record(resolved?.presented).warning;
    const body = resolved ? projectTierlistPublic(resolved.presented, sourceId,
      warning === 'stale' || warning === 'fallback' ? warning : undefined) : null;
    if (resolved && body) {
      const entry = { body, etag: tierlistPublicEtag(body), expiresAt: timestamp + (warning ? 0 : PUBLIC_CACHE_MS) };
      publicCache.set(sourceId, entry);
      return send(entry, resolved.cacheSource);
    }
    if (cached) {
      const stale = { ...cached.body, warning: 'stale' as const };
      return send({ body: stale, etag: tierlistPublicEtag(stale) }, 'memory-stale');
    }
    response.set('Retry-After', '60');
    return response.status(503).json({ error: 'Tierlist unavailable' });
  });

  return router;
}
