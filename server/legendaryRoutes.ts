import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import {
  legendariesPublicEtag,
  projectLegendariesPublic,
  type PublicLegendaries,
} from './legendaryPublicProjection.js';

export type LegendaryPublicCacheEntry = { body: PublicLegendaries; etag: string; expiresAt: number };

export type LegendaryCacheEntry = { data: any; etag: string; expiresAt: number };
export type LegendaryDataResult = {
  data: any;
  etag: string;
  cacheSource: 'memory' | 'redis' | 'origin';
};

export type LegendaryRouterDependencies = {
  accessGuard: RequestHandler;
  cache: Map<string, LegendaryCacheEntry>;
  /** Own store of the open projection, keyed `legendaries-public:<source>`. */
  publicCache?: Map<string, LegendaryPublicCacheEntry>;
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
  const publicCache = dependencies.publicCache ?? new Map<string, LegendaryPublicCacheEntry>();
  const publicCacheHeader = 'public, max-age=300, stale-while-revalidate=600';
  const publicCacheMs = 300_000;

  router.get('/legendaries/public', async (request, response) => {
    const source = dependencies.resolveSource(request.query.source as string | undefined);
    const key = `legendaries-public:${source}`;
    const timestamp = now();
    const send = (body: PublicLegendaries, etag: string, header: string, origin: string) =>
      sendDatasetJsonCached(request, response, body, etag, header, origin);
    const cached = publicCache.get(key);
    if (cached && cached.expiresAt > timestamp) return send(cached.body, cached.etag, publicCacheHeader, 'memory');

    try {
      // The public endpoint never bypasses the cache: an anonymous caller must not reach the origin.
      const result = await dependencies.getData(source, timestamp, false);
      if (!dependencies.isUsableData(result.data)) throw new Error('Empty legendaries dataset');
      const body = projectLegendariesPublic(result.data, source);
      if (!body) throw new Error('Empty public legendaries projection');
      const etag = legendariesPublicEtag(body);
      publicCache.set(key, { body, etag, expiresAt: timestamp + publicCacheMs });
      return send(body, etag, publicCacheHeader, result.cacheSource);
    } catch (error) {
      dependencies.onError?.(error);
      if (cached) {
        const body = { ...cached.body, warning: 'stale' as const };
        return send(body, legendariesPublicEtag(body), publicCacheHeader, 'memory-stale');
      }
      const fallback = dependencies.loadFallback(source);
      const body = fallback && dependencies.isUsableData(fallback.data)
        ? projectLegendariesPublic(fallback.data, source, 'fallback')
        : null;
      if (body) return send(body, legendariesPublicEtag(body), publicCacheHeader, 'fallback');
      response.set('Retry-After', '60');
      return response.status(503).json({ error: 'Legendaries unavailable' });
    }
  });

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
