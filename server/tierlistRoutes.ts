import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';

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
  cacheHeader?: string;
  provisionalCacheHeader?: string;
  staleCacheHeader?: string;
  fallbackCacheHeader?: string;
  now?: () => number;
  onError?: (error: unknown) => void;
};

export function createTierlistRouter(dependencies: TierlistRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=3600';
  const provisionalCacheHeader = dependencies.provisionalCacheHeader ?? 'public, max-age=300, stale-while-revalidate=300';
  const staleCacheHeader = dependencies.staleCacheHeader ?? 'public, max-age=300, stale-while-revalidate=600';
  const fallbackCacheHeader = dependencies.fallbackCacheHeader ?? 'public, max-age=21600, stale-while-revalidate=3600';
  const now = dependencies.now ?? Date.now;

  router.get('/tierlist', dependencies.accessGuard, async (request, response) => {
    const source = dependencies.resolveSource(request.query.source as string | undefined);
    const timestamp = now();
    const cached = dependencies.cache.get(source);
    const bypassCache = request.query.t !== undefined || request.query.bust === '1';

    if (!bypassCache && cached && cached.expiresAt > timestamp) {
      const presented = dependencies.present(cached.data);
      return sendDatasetJsonCached(
        request,
        response,
        presented,
        cached.etag,
        presented?.provisional === true ? provisionalCacheHeader : cacheHeader,
        'memory',
      );
    }

    try {
      const result = await dependencies.getData(source, timestamp, bypassCache);
      const presented = dependencies.present(result.data);
      return sendDatasetJsonCached(
        request,
        response,
        presented,
        result.etag,
        presented?.provisional === true ? provisionalCacheHeader : cacheHeader,
        result.cacheSource,
      );
    } catch (error) {
      dependencies.onError?.(error);
      if (cached) {
        const presented = dependencies.present({ ...cached.data, warning: 'stale' });
        return sendDatasetJsonCached(
          request,
          response,
          presented,
          cached.etag,
          presented?.provisional === true ? provisionalCacheHeader : staleCacheHeader,
          'memory-stale',
        );
      }

      const fallback = dependencies.loadFallback(source);
      if (fallback) {
        const presented = dependencies.present({ ...fallback.data, warning: 'fallback' });
        return sendDatasetJsonCached(
          request,
          response,
          presented,
          fallback.etag,
          presented?.provisional === true ? provisionalCacheHeader : fallbackCacheHeader,
          'fallback',
        );
      }

      return response.status(502).json({ error: 'Tierlist unavailable' });
    }
  });

  return router;
}
