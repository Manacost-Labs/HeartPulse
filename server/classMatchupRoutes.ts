import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';

type CacheEntry = { data: any; etag: string; expiresAt: number };
type RedisEntry = { data: any; etag: string };

export type ClassMatchupCacheStore = { current: CacheEntry | null };

export type ClassMatchupRouterDependencies = {
  accessGuard: RequestHandler;
  cache: ClassMatchupCacheStore;
  redisKey: string;
  redisGet: (key: string) => Promise<RedisEntry | null>;
  redisSet: (key: string, data: any, etag: string, ttlSeconds: number) => Promise<unknown> | unknown;
  fetchMatchups: () => Promise<any>;
  memoryTtlMs: number;
  redisTtlSeconds: number;
  cacheHeader?: string;
  staleCacheHeader?: string;
  now?: () => number;
  onError?: (scope: 'redis-read' | 'redis-write' | 'origin', error: unknown) => void;
};

export function createClassMatchupRouter(dependencies: ClassMatchupRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=600';
  const staleHeader = dependencies.staleCacheHeader ?? 'public, max-age=300, stale-while-revalidate=600';
  const now = dependencies.now ?? Date.now;

  router.get('/class-matchups', dependencies.accessGuard, async (request, response) => {
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
      const data = await dependencies.fetchMatchups();
      const updatedMs = data.updatedAt ? Date.parse(data.updatedAt) : Number.NaN;
      const updatedToken = Number.isFinite(updatedMs) ? updatedMs.toString(36) : timestamp.toString(36);
      const etag = `"class-matchups-${updatedToken}-${data.matchups.length}"`;
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
          staleHeader,
          'memory-stale',
        );
      }
      return response.status(502).json({ error: 'Class matchups unavailable' });
    }
  });

  return router;
}
