import { Router, type RequestHandler, type Response } from 'express';

export type StandardMatchupRank = 'legend' | 'diamond';
type CacheEntry = { data: any; etag: string; expiresAt: number };
type RedisEntry = { data: any; etag: string };

export type StandardMatchupRouterDependencies = {
  accessGuard: RequestHandler;
  memoryCache: Map<string, CacheEntry>;
  redisKey: (rank: StandardMatchupRank) => string;
  redisGet: (key: string) => Promise<RedisEntry | null>;
  redisSet: (key: string, data: any, etag: string, ttlSeconds: number) => Promise<unknown> | unknown;
  fetchPayload: (rank: StandardMatchupRank) => Promise<any>;
  getTranslations: (now: number) => Promise<any>;
  transform: (payload: any, rank: StandardMatchupRank, translations: any) => any;
  memoryTtlMs: number;
  redisTtlSeconds: number;
  cacheHeader?: string;
  now?: () => number;
  onError?: (scope: 'redis-read' | 'redis-write' | 'origin', error: unknown) => void;
};

function responseCacheHeader(response: Response, header: string) {
  if (!response.locals.subscriptionGuarded) return header;
  response.vary('Cookie');
  response.vary('Authorization');
  return header.replace(/^public\b/i, 'private');
}

function sendCached(
  requestEtag: string | undefined,
  response: Response,
  data: any,
  etag: string,
  cacheHeader: string,
  source: string,
) {
  response.set('Cache-Control', responseCacheHeader(response, cacheHeader));
  response.set('ETag', etag);
  response.set('X-Data-Cache', source);
  if (requestEtag === etag) return response.status(304).end();
  return response.json(data);
}

export function createStandardMatchupRouter(dependencies: StandardMatchupRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=600';
  const now = dependencies.now ?? Date.now;

  router.get('/standard/matchups', dependencies.accessGuard, async (request, response) => {
    const rank: StandardMatchupRank = request.query.rank === 'diamond' ? 'diamond' : 'legend';
    const timestamp = now();
    const cached = dependencies.memoryCache.get(rank);
    if (cached && cached.expiresAt > timestamp) {
      return sendCached(request.headers['if-none-match'], response, cached.data, cached.etag, cacheHeader, 'memory');
    }

    const key = dependencies.redisKey(rank);
    try {
      const redisCached = await dependencies.redisGet(key);
      if (redisCached) {
        dependencies.memoryCache.set(rank, {
          data: redisCached.data,
          etag: redisCached.etag,
          expiresAt: timestamp + dependencies.memoryTtlMs,
        });
        return sendCached(request.headers['if-none-match'], response, redisCached.data, redisCached.etag, cacheHeader, 'redis');
      }
    } catch (error) {
      dependencies.onError?.('redis-read', error);
    }

    try {
      const [payload, translations] = await Promise.all([
        dependencies.fetchPayload(rank),
        dependencies.getTranslations(timestamp),
      ]);
      const data = dependencies.transform(payload, rank, translations);
      const updatedMs = data.updatedAt ? Date.parse(data.updatedAt) : Number.NaN;
      const updatedToken = Number.isFinite(updatedMs) ? updatedMs.toString(36) : timestamp.toString(36);
      const etag = `"standard-matchups-v4-${rank}-${updatedToken}-${data.rows.length}-${data.columns.length}-${data.translationSource}"`;
      dependencies.memoryCache.set(rank, {
        data,
        etag,
        expiresAt: timestamp + dependencies.memoryTtlMs,
      });
      Promise.resolve(dependencies.redisSet(key, data, etag, dependencies.redisTtlSeconds))
        .catch(error => dependencies.onError?.('redis-write', error));
      return sendCached(request.headers['if-none-match'], response, data, etag, cacheHeader, 'origin');
    } catch (error) {
      dependencies.onError?.('origin', error);
      if (cached) {
        return sendCached(
          request.headers['if-none-match'],
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
