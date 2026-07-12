import { Router } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';

type CacheEntry = { data: any; etag: string; expiresAt: number };
type RedisEntry = { data: any; etag: string };

export type HomeSummaryCacheStore = { current: CacheEntry | null };

export type HomeSummaryRouterDependencies = {
  cache: HomeSummaryCacheStore;
  redisKey: string;
  redisGet: (key: string) => Promise<RedisEntry | null>;
  redisSet: (key: string, data: any, etag: string, ttlSeconds: number) => Promise<unknown> | unknown;
  buildSummary: (now: number) => Promise<any>;
  makeEtag: (data: any, now: number) => string;
  memoryTtlMs: number;
  redisTtlSeconds: number;
  cacheHeader?: string;
  staleCacheHeader?: string;
  now?: () => number;
  onError?: (scope: 'redis-read' | 'redis-write' | 'origin', error: unknown) => void;
};

export function createHomeSummaryRouter(dependencies: HomeSummaryRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=300, stale-while-revalidate=300';
  const staleCacheHeader = dependencies.staleCacheHeader ?? 'public, max-age=60, stale-while-revalidate=300';
  const now = dependencies.now ?? Date.now;

  router.get('/home/summary', async (request, response) => {
    const timestamp = now();
    const cached = dependencies.cache.current;
    if (cached && cached.expiresAt > timestamp) {
      return sendDatasetJsonCached(request, response, cached.data, cached.etag, cacheHeader, 'memory');
    }

    try {
      const redisCached = await dependencies.redisGet(dependencies.redisKey);
      if (redisCached) {
        dependencies.cache.current = {
          data: redisCached.data,
          etag: redisCached.etag,
          expiresAt: timestamp + dependencies.memoryTtlMs,
        };
        return sendDatasetJsonCached(request, response, redisCached.data, redisCached.etag, cacheHeader, 'redis');
      }
    } catch (error) {
      dependencies.onError?.('redis-read', error);
    }

    try {
      const data = await dependencies.buildSummary(timestamp);
      const etag = dependencies.makeEtag(data, timestamp);
      dependencies.cache.current = {
        data,
        etag,
        expiresAt: timestamp + dependencies.memoryTtlMs,
      };
      Promise.resolve(dependencies.redisSet(
        dependencies.redisKey,
        data,
        etag,
        dependencies.redisTtlSeconds,
      )).catch(error => dependencies.onError?.('redis-write', error));
      return sendDatasetJsonCached(request, response, data, etag, cacheHeader, 'origin');
    } catch (error) {
      dependencies.onError?.('origin', error);
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
      return response.status(502).json({ error: 'Home summary unavailable' });
    }
  });

  return router;
}
