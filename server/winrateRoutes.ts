import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';

export type ClassWinrateSource = 'hsreplay' | 'firestone';
type CacheEntry = { data: any; etag: string; expiresAt: number };
type RedisEntry = { data: any; etag: string };
type SnapshotEntry = { data: any; etag: string };

export type WinrateRouterDependencies = {
  accessGuard: RequestHandler;
  cache: Map<string, CacheEntry>;
  redisKey: (source: ClassWinrateSource) => string;
  redisGet: (key: string) => Promise<RedisEntry | null>;
  redisSet: (key: string, data: any, etag: string, ttlSeconds: number) => Promise<unknown> | unknown;
  fetchSource: (source: ClassWinrateSource) => Promise<any>;
  loadSnapshot: () => SnapshotEntry | null;
  memoryTtlMs: number;
  redisTtlSeconds: number;
  cacheHeader?: string;
  staleCacheHeader?: string;
  now?: () => number;
  onError?: (scope: 'redis-read' | 'redis-write' | 'origin', source: ClassWinrateSource, error: unknown) => void;
};

function validDataset(data: any): boolean {
  return Array.isArray(data?.classes) && data.classes.length > 0;
}

function updatedTime(data: any): number {
  const parsed = data?.updatedAt ? Date.parse(data.updatedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function createEtag(source: string, data: any, timestamp: number): string {
  const updated = updatedTime(data) || timestamp;
  return `"class-winrates-${source}-${updated.toString(36)}-${data.classes.length}"`;
}

export function createWinrateRouter(dependencies: WinrateRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=300, stale-while-revalidate=300';
  const staleCacheHeader = dependencies.staleCacheHeader ?? 'public, max-age=300, stale-while-revalidate=600';
  const now = dependencies.now ?? Date.now;

  router.get('/winrates', dependencies.accessGuard, async (request, response) => {
    const source: ClassWinrateSource = request.query.source === 'firestone' ? 'firestone' : 'hsreplay';
    const timestamp = now();
    const cached = dependencies.cache.get(source);
    if (cached && cached.expiresAt > timestamp && validDataset(cached.data)) {
      return sendDatasetJsonCached(request, response, cached.data, cached.etag, cacheHeader, 'memory');
    }

    const key = dependencies.redisKey(source);
    try {
      const redisCached = await dependencies.redisGet(key);
      if (redisCached && validDataset(redisCached.data)) {
        dependencies.cache.set(source, {
          data: redisCached.data,
          etag: redisCached.etag,
          expiresAt: timestamp + dependencies.memoryTtlMs,
        });
        return sendDatasetJsonCached(request, response, redisCached.data, redisCached.etag, cacheHeader, 'redis');
      }
    } catch (error) {
      dependencies.onError?.('redis-read', source, error);
    }

    const snapshot = dependencies.loadSnapshot();
    try {
      const upstreamData = await dependencies.fetchSource(source);
      if (!validDataset(upstreamData)) throw new Error('Empty class winrate dataset');

      const useSnapshot = source === 'hsreplay'
        && snapshot
        && validDataset(snapshot.data)
        && updatedTime(snapshot.data) > updatedTime(upstreamData);
      const data = useSnapshot
        ? { ...snapshot.data, source: snapshot.data.source ?? 'cached' }
        : upstreamData;
      const cacheSource = useSnapshot ? 'local-fresher-than-upstream' : 'origin';
      const etag = createEtag(useSnapshot ? 'local' : source, data, timestamp);
      dependencies.cache.set(source, {
        data,
        etag,
        expiresAt: timestamp + dependencies.memoryTtlMs,
      });
      Promise.resolve(dependencies.redisSet(key, data, etag, dependencies.redisTtlSeconds))
        .catch(error => dependencies.onError?.('redis-write', source, error));
      return sendDatasetJsonCached(request, response, data, etag, cacheHeader, cacheSource);
    } catch (error) {
      dependencies.onError?.('origin', source, error);
      if (cached && validDataset(cached.data)) {
        return sendDatasetJsonCached(
          request,
          response,
          { ...cached.data, warning: 'stale' },
          cached.etag,
          staleCacheHeader,
          'memory-stale',
        );
      }
      if (snapshot && validDataset(snapshot.data)) {
        return sendDatasetJsonCached(
          request,
          response,
          { ...snapshot.data, source: snapshot.data.source ?? 'cached', warning: 'fallback' },
          snapshot.etag,
          staleCacheHeader,
          'fallback',
        );
      }
      return response.status(502).json({ error: 'Class winrates unavailable' });
    }
  });

  return router;
}
