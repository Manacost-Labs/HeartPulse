import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';

export type StandardMatchupFormat = 'standard' | 'wild';
type CacheEntry = { data: any; etag: string; expiresAt: number };
type RedisEntry = { data: any; etag: string };

export type StandardMatchupRouterDependencies = {
  accessGuard: RequestHandler;
  memoryCache: Map<string, CacheEntry>;
  redisKey: (format: StandardMatchupFormat) => string;
  redisGet: (key: string) => Promise<RedisEntry | null>;
  redisSet: (key: string, data: any, etag: string, ttlSeconds: number) => Promise<unknown> | unknown;
  fetchPayload: (format: StandardMatchupFormat) => Promise<any>;
  getTranslations: (now: number) => Promise<any>;
  transform: (payload: any, format: StandardMatchupFormat, translations: any) => any;
  memoryTtlMs: number;
  redisTtlSeconds: number;
  cacheHeader?: string;
  now?: () => number;
  onError?: (scope: 'redis-read' | 'redis-write' | 'origin', error: unknown) => void;
};

export function createStandardMatchupRouter(dependencies: StandardMatchupRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=600';
  const now = dependencies.now ?? Date.now;

  router.get('/standard/matchups', dependencies.accessGuard, async (request, response) => {
    const format: StandardMatchupFormat = request.query.format === 'wild' ? 'wild' : 'standard';
    const timestamp = now();
    const cached = dependencies.memoryCache.get(format);
    if (cached && cached.expiresAt > timestamp) {
      return sendDatasetJsonCached(request, response, cached.data, cached.etag, cacheHeader, 'memory');
    }

    const key = dependencies.redisKey(format);
    try {
      const redisCached = await dependencies.redisGet(key);
      if (redisCached) {
        dependencies.memoryCache.set(format, {
          data: redisCached.data,
          etag: redisCached.etag,
          expiresAt: timestamp + dependencies.memoryTtlMs,
        });
        return sendDatasetJsonCached(request, response, redisCached.data, redisCached.etag, cacheHeader, 'redis');
      }
    } catch (error) {
      dependencies.onError?.('redis-read', error);
    }

    try {
      const [payload, translations] = await Promise.all([
        dependencies.fetchPayload(format),
        dependencies.getTranslations(timestamp),
      ]);
      const data = dependencies.transform(payload, format, translations);
      const updatedMs = data.updatedAt ? Date.parse(data.updatedAt) : Number.NaN;
      const updatedToken = Number.isFinite(updatedMs) ? updatedMs.toString(36) : timestamp.toString(36);
      const etag = `"standard-matchups-v5-${format}-${updatedToken}-${data.rows.length}-${data.columns.length}-${data.translationSource}"`;
      dependencies.memoryCache.set(format, {
        data,
        etag,
        expiresAt: timestamp + dependencies.memoryTtlMs,
      });
      Promise.resolve(dependencies.redisSet(key, data, etag, dependencies.redisTtlSeconds))
        .catch(error => dependencies.onError?.('redis-write', error));
      return sendDatasetJsonCached(request, response, data, etag, cacheHeader, 'origin');
    } catch (error) {
      dependencies.onError?.('origin', error);
      if (cached) {
        return sendDatasetJsonCached(
          request,
          response,
          { ...cached.data, warning: 'stale' },
          cached.etag,
          cacheHeader,
          'memory-stale',
        );
      }
      return response.status(502).json({ error: 'Standard matchups unavailable' });
    }
  });

  return router;
}
