import { createHash } from 'node:crypto';
import type { Router } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import { standardMatchupSliceKey, type StandardMatchupFormat, type StandardMatchupSlice } from './standardMatchupSlices.js';

/**
 * The general slice every guest sees: all ranks, the source's default period and
 * the page's default floor of games per pair. Narrow ranks and the history of a
 * pair stay behind the subscription; the request cannot name them.
 */
export const PUBLIC_STANDARD_MATCHUP_SLICE = { rank: 'all', period: null, minGames: 25 } as const;

const PUBLIC_CACHE_HEADER = 'public, max-age=300, stale-while-revalidate=900';
const PUBLIC_CACHE_MS = 300_000;
/** Last good open projection in Redis, apart from the subscribers' `without-other` entry. */
const PUBLIC_REDIS_SUFFIX = ':public-v1';

type Raw = Record<string, unknown> | null | undefined;
const record = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : null);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const isOther = (name: string): boolean => /^other(?:\s|$)/i.test(name);
const count = (value: unknown): number => {
  const number = finite(value);
  return number !== null && number >= 0 ? Math.round(number) : 0;
};

/** What the open route needs of the router's dependencies (its own type: the router imports this file). */
export type PublicStandardMatchupsDependencies = {
  publicCache?: Map<string, PublicStandardMatchupsCacheEntry>;
  redisKey: (slice: StandardMatchupSlice) => string;
  redisGet: (key: string) => Promise<{ data: unknown; etag: string } | null>;
  redisSet: (key: string, data: unknown, etag: string, ttlSeconds: number) => Promise<unknown> | unknown;
  fetchPayload: (slice: StandardMatchupSlice) => Promise<unknown>;
  getTranslations: (now: number) => Promise<unknown>;
  transform: (payload: unknown, slice: StandardMatchupSlice, translations: unknown) => unknown;
  redisTtlSeconds: number;
  now?: () => number;
  onError?: (scope: 'redis-read' | 'redis-write' | 'origin', error: unknown) => void;
};

export type PublicStandardMatchups = ReturnType<typeof projectStandardMatchupsPublic> & { warning?: 'stale' | 'fallback' };
export type PublicStandardMatchupsCacheEntry = { body: PublicStandardMatchups; etag: string; expiresAt: number };

/**
 * Field-by-field allowlist of the open matrix: archetype, class, popularity and
 * games of every row and column, win rate and games of every pair, the date and
 * the source. Whatever else a dataset carries (ranks, periods, history, a field
 * added later) stays out until it is named here.
 */
export function projectStandardMatchupsPublic(data: unknown, format: StandardMatchupFormat) {
  const source = record(data);
  const columns = (Array.isArray(source?.columns) ? source.columns : []).flatMap(column => {
    const item = record(column);
    const name = text(item?.name);
    return item && name && !isOther(name) ? [{
      name, label: text(item.label) || name, classKey: text(item.classKey) || null,
      popularity: text(item.popularity) || null, games: count(item.games),
    }] : [];
  });
  const visible = new Set(columns.map(column => column.name));
  const rows = (Array.isArray(source?.rows) ? source.rows : []).flatMap(row => {
    const item = record(row);
    const archetype = text(item?.archetype);
    const cells: unknown[] = Array.isArray(item?.cells) ? item.cells : [];
    if (!item || !archetype || isOther(archetype) || !Array.isArray(item.cells)) return [];
    return [{
      archetype, archetypeLabel: text(item.archetypeLabel) || archetype, classKey: text(item.classKey) || null,
      winrate: finite(item.winrate), games: count(item.games),
      cells: cells.flatMap(cell => {
        const pair = record(cell);
        const opponent = text(pair?.opponent);
        return pair && visible.has(opponent)
          ? [{ opponent, winrate: finite(pair.winrate), games: count(pair.games) }] : [];
      }),
    }];
  });
  const updatedAt = text(source?.updatedAt);
  return {
    format,
    formatLabel: text(source?.formatLabel),
    rank: PUBLIC_STANDARD_MATCHUP_SLICE.rank,
    rankLabel: text(source?.rankLabel),
    period: text(source?.period) || null,
    minGames: PUBLIC_STANDARD_MATCHUP_SLICE.minGames,
    totalGames: count(source?.totalGames),
    source: 'hsguru' as const,
    sourceUrl: text(source?.sourceUrl),
    updatedAt: Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    columns,
    rows,
  };
}

export function standardMatchupsPublicEtag(body: PublicStandardMatchups): string {
  return `"standard-matchups-public-${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24)}"`;
}

const usable = (body: PublicStandardMatchups | null): body is PublicStandardMatchups =>
  Boolean(body && body.rows.length > 0 && body.columns.length > 0);

/** One origin read of the open general slice of a format; rejects on a failed or empty read. */
export async function loadPublicStandardMatchups(
  dependencies: Pick<PublicStandardMatchupsDependencies, 'fetchPayload' | 'getTranslations' | 'transform'>,
  format: StandardMatchupFormat,
  timestamp: number,
): Promise<PublicStandardMatchups> {
  const slice: StandardMatchupSlice = { format, ...PUBLIC_STANDARD_MATCHUP_SLICE };
  const [payload, translations] = await Promise.all([
    dependencies.fetchPayload(slice),
    dependencies.getTranslations(timestamp),
  ]);
  const body = projectStandardMatchupsPublic(dependencies.transform(payload, slice, translations), format);
  if (!usable(body)) throw new Error('Empty public Standard matchups projection');
  return body;
}

/**
 * `GET /standard/matchups/public?format=standard|wild`: the open general slice of
 * one format, the same answer for every viewer, so it may sit in a shared cache.
 * Own memory entry per format; a failure answers the last good copy (memory, then
 * Redis) and only then 503 with Retry-After. An anonymous caller never bypasses
 * the cache, and concurrent misses share one origin read.
 */
export function mountPublicStandardMatchups(router: Router, dependencies: PublicStandardMatchupsDependencies): void {
  const now = dependencies.now ?? Date.now;
  const cache = dependencies.publicCache ?? new Map<string, PublicStandardMatchupsCacheEntry>();
  const pending = new Map<string, Promise<PublicStandardMatchups>>();

  const load = (slice: StandardMatchupSlice, timestamp: number) => loadPublicStandardMatchups(dependencies, slice.format, timestamp);

  router.get('/standard/matchups/public', async (request, response) => {
    const requested = String(Array.isArray(request.query.format) ? request.query.format[0] : request.query.format ?? 'standard');
    if (requested !== 'standard' && requested !== 'wild') return response.status(400).json({ error: 'Неизвестный формат' });
    const slice: StandardMatchupSlice = { format: requested, ...PUBLIC_STANDARD_MATCHUP_SLICE };
    const key = `public:${standardMatchupSliceKey(slice)}`;
    const redisKey = `${dependencies.redisKey(slice)}${PUBLIC_REDIS_SUFFIX}`;
    const timestamp = now();
    const send = (body: PublicStandardMatchups, etag: string, origin: string, header = PUBLIC_CACHE_HEADER) =>
      sendDatasetJsonCached(request, response, body, etag, header, origin);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > timestamp) return send(cached.body, cached.etag, 'memory');

    try {
      let read = pending.get(key);
      if (!read) {
        read = load(slice, timestamp).finally(() => pending.delete(key));
        pending.set(key, read);
      }
      const body = await read;
      const etag = standardMatchupsPublicEtag(body);
      cache.set(key, { body, etag, expiresAt: timestamp + PUBLIC_CACHE_MS });
      Promise.resolve(dependencies.redisSet(redisKey, body, etag, dependencies.redisTtlSeconds))
        .catch(error => dependencies.onError?.('redis-write', error));
      return send(body, etag, 'origin');
    } catch (error) {
      dependencies.onError?.('origin', error);
      if (cached) {
        const body: PublicStandardMatchups = { ...cached.body, warning: 'stale' };
        return send(body, standardMatchupsPublicEtag(body), 'memory-stale');
      }
      try {
        const last = await dependencies.redisGet(redisKey);
        // Re-projected on the way out: an entry written by an older build is not trusted as it stands.
        const body = last ? projectStandardMatchupsPublic(last.data, slice.format) : null;
        if (usable(body)) {
          const fallback: PublicStandardMatchups = { ...body, warning: 'fallback' };
          return send(fallback, standardMatchupsPublicEtag(fallback), 'fallback');
        }
      } catch (redisError) {
        dependencies.onError?.('redis-read', redisError);
      }
      response.set('Retry-After', '60');
      response.set('Cache-Control', 'no-store');
      return response.status(503).json({ error: 'Standard matchups unavailable' });
    }
  });
}
