import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';

export type LegendaryCacheEntry = { data: any; etag: string; expiresAt: number };
export type LegendaryDataResult = {
  data: any;
  etag: string;
  cacheSource: 'memory' | 'redis' | 'origin';
};

export type LegendaryRouterDependencies = {
  accessGuard: RequestHandler;
  cache: Map<string, LegendaryCacheEntry>;
  resolveSource: (source: string | undefined) => string;
  getData: (source: string, now: number, bypassCache: boolean) => Promise<LegendaryDataResult>;
  isUsableData: (data: any) => boolean;
  loadFallback: (source: string) => { data: any; etag: string } | null;
  cacheHeader?: string;
  staleCacheHeader?: string;
  fallbackCacheHeader?: string;
  now?: () => number;
  onError?: (error: unknown) => void;
};

export function createLegendaryRouter(dependencies: LegendaryRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=600';
  const staleCacheHeader = dependencies.staleCacheHeader ?? 'public, max-age=300, stale-while-revalidate=600';
  const fallbackCacheHeader = dependencies.fallbackCacheHeader ?? 'public, max-age=21600, stale-while-revalidate=3600';
  const now = dependencies.now ?? Date.now;

  router.get('/legendaries', dependencies.accessGuard, async (request, response) => {
    const source = dependencies.resolveSource(request.query.source as string | undefined);
    const timestamp = now();
    let cached = dependencies.cache.get(source);
    const bypassCache = request.query.t !== undefined || request.query.bust === '1';

    if (cached && !dependencies.isUsableData(cached.data)) {
      dependencies.cache.delete(source);
      cached = undefined;
    }

    if (!bypassCache && cached && cached.expiresAt > timestamp) {
      return sendDatasetJsonCached(request, response, cached.data, cached.etag, cacheHeader, 'memory');
    }

    try {
      const result = await dependencies.getData(source, timestamp, bypassCache);
      if (!dependencies.isUsableData(result.data)) throw new Error('Empty legendaries dataset');
      return sendDatasetJsonCached(
        request,
        response,
        result.data,
        result.etag,
        cacheHeader,
        result.cacheSource,
      );
    } catch (error) {
      dependencies.onError?.(error);
      if (cached) {
        return sendDatasetJsonCached(
          request,
          response,
          { ...cached.data, warning: 'stale' },
          cached.etag,
          staleCacheHeader,
          'memory-stale',
        );
      }

      const fallback = dependencies.loadFallback(source);
      if (fallback && dependencies.isUsableData(fallback.data)) {
        return sendDatasetJsonCached(
          request,
          response,
          { ...fallback.data, warning: 'fallback' },
          fallback.etag,
          fallbackCacheHeader,
          'fallback',
        );
      }

      return response.status(502).json({ error: 'Legendaries unavailable' });
    }
  });

  return router;
}
