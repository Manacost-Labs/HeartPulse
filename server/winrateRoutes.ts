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

/**
 * What the anonymous projection may say about a class. Every field is listed
 * here on purpose: the object is built field by field, never by spreading a
 * dataset row, so a figure added to the dataset later (wins, pick rate,
 * distributions, matchups) stays closed.
 */
export type WinratesTeaserClass = {
  place: number;
  id: string;
  name: string;
  /** Rounded to 0.1 percentage point; a more precise winrate is a closed value. */
  winrate: number;
  /** Games (drafts for HSReplay) of the class in the dataset; `null` when the source gives none. */
  games: number | null;
};

export type WinratesPublicTeaser = {
  updatedAt: string | null;
  source: string;
  classes: WinratesTeaserClass[];
};

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

/**
 * The open slice of a class winrate dataset: the order of the classes with a
 * winrate rounded to 0.1, the games of the class, the date and the source.
 * Classes are ranked by the dataset's own winrate (used only for the order).
 * `null` when no class has a usable winrate or the dataset is synthetic.
 */
export function projectWinratesPublicTeaser(dataset: unknown): WinratesPublicTeaser | null {
  const data = record(dataset);
  const source = text(data.source);
  if (source === 'initial' || !Array.isArray(data.classes)) return null;
  const ranked: Array<{ id: string; name: string; exact: number; games: number | null }> = [];
  for (const entry of data.classes as unknown[]) {
    const row = record(entry);
    const id = text(row.id);
    const name = text(row.name);
    const exact = typeof row.winrate === 'number' ? row.winrate : Number.NaN;
    if (!id || !name || !Number.isFinite(exact) || exact < 0 || exact > 100) continue;
    const games = typeof row.games === 'number' && Number.isFinite(row.games) && row.games > 0 ? Math.floor(row.games) : null;
    ranked.push({ id, name, exact, games });
  }
  if (!ranked.length) return null;
  ranked.sort((a, b) => b.exact - a.exact);
  const updatedAt = text(data.updatedAt);
  return {
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    // The teaser reads the default source only: a Firestone dataset says so, the rest is HSReplay's
    // (its dataset arrives as `api.kolodahearthstone.com`, a snapshot as `cached`).
    source: /firestone/i.test(source) ? 'Firestone' : 'HSReplay',
    classes: ranked.map((item, index) => ({
      place: index + 1, id: item.id, name: item.name, winrate: Math.round(item.exact * 10) / 10, games: item.games,
    })),
  };
}

type ResolvedWinrates = { data: unknown; etag: string; cacheControl: string; cacheSource: string };

export function createWinrateRouter(dependencies: WinrateRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=300, stale-while-revalidate=300';
  const staleCacheHeader = dependencies.staleCacheHeader ?? 'public, max-age=300, stale-while-revalidate=600';
  const now = dependencies.now ?? Date.now;

  /** The dataset for a source: memory, Redis, origin (or a fresher snapshot), stale memory, then the snapshot; `null` when none. */
  const resolveWinrates = async (source: ClassWinrateSource): Promise<ResolvedWinrates | null> => {
    const timestamp = now();
    const cached = dependencies.cache.get(source);
    if (cached && cached.expiresAt > timestamp && validDataset(cached.data)) {
      return { data: cached.data, etag: cached.etag, cacheControl: cacheHeader, cacheSource: 'memory' };
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
        return { data: redisCached.data, etag: redisCached.etag, cacheControl: cacheHeader, cacheSource: 'redis' };
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
      return { data, etag, cacheControl: cacheHeader, cacheSource };
    } catch (error) {
      dependencies.onError?.('origin', source, error);
      if (cached && validDataset(cached.data)) {
        return { data: { ...cached.data, warning: 'stale' }, etag: cached.etag, cacheControl: staleCacheHeader, cacheSource: 'memory-stale' };
      }
      if (snapshot && validDataset(snapshot.data)) {
        return {
          data: { ...snapshot.data, source: snapshot.data.source ?? 'cached', warning: 'fallback' },
          etag: snapshot.etag, cacheControl: staleCacheHeader, cacheSource: 'fallback',
        };
      }
      return null;
    }
  };

  router.get('/winrates', dependencies.accessGuard, async (request, response) => {
    const source: ClassWinrateSource = request.query.source === 'firestone' ? 'firestone' : 'hsreplay';
    const resolved = await resolveWinrates(source);
    if (!resolved) return response.status(502).json({ error: 'Class winrates unavailable' });
    return sendDatasetJsonCached(request, response, resolved.data, resolved.etag, resolved.cacheControl, resolved.cacheSource);
  });

  // No access guard: this is the open slice of the page for guests and robots.
  // It reads the default source only, so a guest cannot fan out origin reads,
  // and answers with the whitelisted projection.
  router.get('/winrates/public-teaser', async (request, response) => {
    const resolved = await resolveWinrates('hsreplay');
    const teaser = resolved ? projectWinratesPublicTeaser(resolved.data) : null;
    if (!resolved || !teaser) return response.status(502).json({ error: 'Class winrates unavailable' });
    return sendDatasetJsonCached(request, response, teaser, `"teaser-${resolved.etag.replace(/"/g, '')}"`,
      resolved.cacheControl, resolved.cacheSource);
  });

  return router;
}
