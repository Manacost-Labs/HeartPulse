import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import { inferStandardMetaClass, normalizeStandardMetaClass, type StandardMetaClassKey } from './standardMetaClasses.js';

export type StandardMatchupFormat = 'standard' | 'wild';
type CacheEntry = { data: any; etag: string; expiresAt: number };
type RedisEntry = { data: any; etag: string };

/** HSGuru /matchups ranks, most played first in its own menu order. */
export const STANDARD_MATCHUP_RANKS = [
  'all', 'top_legend', 'top_5k', 'legend', 'diamond_to_legend', 'diamond_4to1', 'bronze_plat',
] as const;
export type StandardMatchupRank = typeof STANDARD_MATCHUP_RANKS[number];
export const STANDARD_MATCHUP_RANK_LABEL: Record<StandardMatchupRank, string> = {
  all: 'Все ранги',
  top_legend: 'Топ-1000',
  top_5k: 'Топ-5000',
  legend: 'Легенда',
  diamond_to_legend: 'Алмаз — Легенда',
  diamond_4to1: 'Алмаз 4–1',
  bronze_plat: 'Бронза — Платина',
};
/** HSGuru's «Min Matchup Games» menu: minimum games of one pair. */
export const STANDARD_MATCHUP_MIN_GAMES = [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;
export const STANDARD_MATCHUP_DEFAULTS = { rank: 'legend', minGames: 25 } as const;
/** The matrix keeps the most played archetypes; the rest are a long tail of rare lists. */
export const STANDARD_MATCHUP_ARCHETYPE_LIMIT = 60;
const PERIOD_PATTERN = /^[a-z0-9_.]{1,64}$/;

/** One HSGuru matchup slice; `period: null` is the source's default, the Bans window. */
export type StandardMatchupSlice = {
  format: StandardMatchupFormat;
  rank: StandardMatchupRank;
  period: string | null;
  minGames: number;
};

function first(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim();
}

/** The slice of a request; unknown values fall back to the defaults, never reach the source. */
export function parseStandardMatchupSlice(query: Record<string, unknown>): StandardMatchupSlice {
  const rank = first(query.rank);
  const period = first(query.period);
  const minGames = Number(first(query.min_games));
  return {
    format: first(query.format) === 'wild' ? 'wild' : 'standard',
    rank: (STANDARD_MATCHUP_RANKS as readonly string[]).includes(rank)
      ? rank as StandardMatchupRank : STANDARD_MATCHUP_DEFAULTS.rank,
    period: PERIOD_PATTERN.test(period) ? period : null,
    minGames: (STANDARD_MATCHUP_MIN_GAMES as readonly number[]).includes(minGames)
      ? minGames : STANDARD_MATCHUP_DEFAULTS.minGames,
  };
}

export function standardMatchupSliceKey(slice: StandardMatchupSlice): string {
  return [slice.format, slice.rank, slice.period ?? 'default', slice.minGames].join('|');
}

/** hs-data-api path of a slice (`/v1/hsguru/matchups`). */
export function standardMatchupSlicePath(slice: StandardMatchupSlice): string {
  const query = new URLSearchParams({
    format: slice.format,
    rank: slice.rank,
    min_games: String(slice.minGames),
    limit: String(STANDARD_MATCHUP_ARCHETYPE_LIMIT),
  });
  if (slice.period) query.set('period', slice.period);
  return `v1/hsguru/matchups?${query}`;
}

export type StandardMatchupRouterDependencies = {
  accessGuard: RequestHandler;
  memoryCache: Map<string, CacheEntry>;
  redisKey: (slice: StandardMatchupSlice) => string;
  redisGet: (key: string) => Promise<RedisEntry | null>;
  redisSet: (key: string, data: any, etag: string, ttlSeconds: number) => Promise<unknown> | unknown;
  fetchPayload: (slice: StandardMatchupSlice) => Promise<any>;
  getTranslations: (now: number) => Promise<any>;
  transform: (payload: any, slice: StandardMatchupSlice, translations: any) => any;
  memoryTtlMs: number;
  redisTtlSeconds: number;
  cacheHeader?: string;
  now?: () => number;
  onError?: (scope: 'redis-read' | 'redis-write' | 'origin', error: unknown) => void;
};

export type HsguruMatchupTransformOptions = {
  formatLabel: string;
  sourceId: string;
  translationSource: string;
  translate: (archetype: string) => string;
};

type HsguruMatchupsTable = { headers?: unknown[]; rows?: unknown[] };
/** The parsed HSGuru page as the dataset API stores it; every field is untrusted. */
export type HsguruMatchupsPayload = {
  fetched_at?: string | null;
  url?: string;
  tables?: HsguruMatchupsTable[];
  data?: { fetched_at?: string | null; url?: string; tables?: HsguruMatchupsTable[] };
} | null | undefined;

function parseMatchupNumber(value: unknown): number | null {
  const raw = String(value ?? '').replace('%', '').replace(',', '.').trim();
  if (!raw || raw === '—' || raw === '-') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

/**
 * HSGuru's matchup table. Its first body row is the popularity row: one value
 * per archetype column and none for the win-rate and name columns, so column
 * `index` reads `popularity[index - 2]`. Empty cells are pairs below HSGuru's
 * `min_matchup_sample` and stay `null`.
 */
export function transformHsguruMatchups(
  payload: HsguruMatchupsPayload,
  format: StandardMatchupFormat,
  options: HsguruMatchupTransformOptions,
) {
  const table = payload?.data?.tables?.[0] ?? payload?.tables?.[0] ?? null;
  const headers = Array.isArray(table?.headers) ? table.headers.map(item => String(item ?? '').trim()) : [];
  const rows: unknown[] = Array.isArray(table?.rows) ? table.rows : [];
  const popularityRow = Array.isArray(rows[0]) ? rows[0] : [];
  const columns: Array<{ name: string; label: string; classKey: StandardMetaClassKey | null; popularity: string | null }> = [];
  const columnIndexes: number[] = [];
  for (let index = 2; index < headers.length; index += 1) {
    const name = headers[index];
    if (!name) continue;
    columnIndexes.push(index);
    columns.push({
      name,
      label: options.translate(name),
      classKey: inferStandardMetaClass(name),
      popularity: String(popularityRow[index - 2] ?? '').trim() || null,
    });
  }

  const dataRows = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!Array.isArray(row)) continue;
    const archetype = String(row[1] ?? '').trim();
    if (!archetype) continue;
    dataRows.push({
      archetype,
      archetypeLabel: options.translate(archetype),
      classKey: inferStandardMetaClass(archetype),
      winrate: parseMatchupNumber(row[0]),
      cells: columns.map((column, position) => ({
        opponent: column.name,
        opponentLabel: column.label,
        winrate: parseMatchupNumber(row[columnIndexes[position]]),
      })),
    });
  }

  return {
    format,
    formatLabel: options.formatLabel,
    rank: 'legend',
    rankLabel: 'Легенда',
    source: 'hsguru',
    sourceId: options.sourceId,
    sourceUrl: payload?.data?.url ?? payload?.url ?? '',
    translationSource: options.translationSource,
    updatedAt: payload?.fetched_at ?? payload?.data?.fetched_at ?? null,
    columns,
    rows: dataRows,
  };
}

type ApiArchetype = { archetype?: unknown; class?: unknown; games?: unknown; winrate?: unknown; popularity_pct?: unknown };
type ApiMatchup = { archetype?: unknown; opponent?: unknown; winrate?: unknown; games?: unknown };
/** hs-data-api `/v1/hsguru/matchups`; every field is untrusted. */
export type HsguruMatchupSlicePayload = {
  data?: {
    period?: unknown; checked_at?: unknown; source_url?: unknown; total_games?: unknown;
    archetypes?: ApiArchetype[]; matchups?: ApiMatchup[];
  };
  meta?: { available?: { periods?: unknown; current_period?: unknown; default_period?: unknown } };
} | null | undefined;

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function count(value: unknown): number {
  const number = finite(value);
  return number !== null && number >= 0 ? Math.round(number) : 0;
}

function periods(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(period => PERIOD_PATTERN.test(period)) : [];
}

/**
 * One slice of the unified HSGuru matchups API as the page's matrix: archetypes
 * by games (rows and columns in the same order) and every pair with its win
 * rate and games. A pair without games, or below the slice's minimum, is null.
 */
export function transformHsguruMatchupSlice(
  payload: HsguruMatchupSlicePayload,
  slice: StandardMatchupSlice,
  options: HsguruMatchupTransformOptions,
) {
  const data = payload?.data ?? {};
  const archetypes = (Array.isArray(data.archetypes) ? data.archetypes : [])
    .map(item => ({
      name: String(item?.archetype ?? '').trim(),
      classKey: normalizeStandardMetaClass(item?.class) ?? inferStandardMetaClass(item?.archetype),
      games: count(item?.games),
      winrate: parseMatchupNumber(item?.winrate),
      popularity: finite(item?.popularity_pct),
    }))
    .filter(item => item.name);
  const pairs = new Map<string, { winrate: number | null; games: number }>();
  for (const cell of Array.isArray(data.matchups) ? data.matchups : []) {
    const games = count(cell?.games);
    if (!games) continue;
    pairs.set(`${String(cell?.archetype ?? '')}\u0000${String(cell?.opponent ?? '')}`,
      { winrate: parseMatchupNumber(cell?.winrate), games });
  }
  const labels = new Map(archetypes.map(item => [item.name, options.translate(item.name)]));
  const available = payload?.meta?.available ?? {};
  const period = typeof data.period === 'string' && PERIOD_PATTERN.test(data.period) ? data.period : slice.period;
  const updatedAt = typeof data.checked_at === 'string' && Number.isFinite(Date.parse(data.checked_at))
    ? data.checked_at : null;
  return {
    format: slice.format,
    formatLabel: options.formatLabel,
    rank: slice.rank,
    rankLabel: STANDARD_MATCHUP_RANK_LABEL[slice.rank],
    period,
    minGames: slice.minGames,
    totalGames: count(data.total_games),
    source: 'hsguru',
    sourceId: options.sourceId,
    sourceUrl: typeof data.source_url === 'string' ? data.source_url : '',
    translationSource: options.translationSource,
    updatedAt,
    available: {
      ranks: [...STANDARD_MATCHUP_RANKS],
      periods: periods(available.periods),
      currentPeriod: typeof available.current_period === 'string' ? available.current_period : null,
      defaultPeriod: typeof available.default_period === 'string' ? available.default_period : null,
      minGames: [...STANDARD_MATCHUP_MIN_GAMES],
    },
    columns: archetypes.map(item => ({
      name: item.name,
      label: labels.get(item.name),
      classKey: item.classKey,
      popularity: item.popularity === null ? null : `${item.popularity.toFixed(1)}%`,
      games: item.games,
    })),
    rows: archetypes.map(row => ({
      archetype: row.name,
      archetypeLabel: labels.get(row.name),
      classKey: row.classKey,
      winrate: row.winrate,
      games: row.games,
      cells: archetypes.map(column => {
        const pair = pairs.get(`${row.name}\u0000${column.name}`);
        return { opponent: column.name, winrate: pair?.winrate ?? null, games: pair?.games ?? 0 };
      }),
    })),
  };
}

/**
 * The router's source and transform for the unified hs-data-api matchups, so
 * the composition root only names its origin, fetcher and labels.
 */
export function standardMatchupSliceDependencies(options: {
  origin: string;
  fetchJson: (url: string, timeoutMs?: number) => Promise<unknown>;
  formatLabel: (format: StandardMatchupFormat) => string;
  translate: (archetype: string, map: Record<string, string>) => string;
}): Pick<StandardMatchupRouterDependencies, 'fetchPayload' | 'transform'> {
  const origin = options.origin.replace(/\/+$/, '');
  return {
    fetchPayload: slice => options.fetchJson(`${origin}/${standardMatchupSlicePath(slice)}`, 20_000),
    transform: (payload, slice, translations) => transformHsguruMatchupSlice(payload, slice, {
      formatLabel: options.formatLabel(slice.format),
      sourceId: 'hsguru_matchups',
      translationSource: String(translations?.source ?? ''),
      translate: name => options.translate(name, translations?.map ?? {}),
    }),
  };
}

function isOtherArchetype(value: unknown): boolean {
  return /^other(?:\s|$)/i.test(String(value ?? '').trim());
}

export function excludeOtherStandardMatchups(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const columns = Array.isArray(data.columns)
    ? data.columns.filter((column: any) => !isOtherArchetype(column?.name ?? column))
    : data.columns;
  const visibleColumns = new Set(
    Array.isArray(columns)
      ? columns
        .map((column: any) => String(column?.name ?? column ?? '').trim())
        .filter(Boolean)
      : [],
  );
  const rows = Array.isArray(data.rows)
    ? data.rows
      .filter((row: any) => !isOtherArchetype(row?.archetype))
      .map((row: any) => {
        if (!Array.isArray(row?.cells)) return row;
        return {
          ...row,
          cells: row.cells.filter((cell: any) => {
            const opponent = String(cell?.opponent ?? '').trim();
            if (isOtherArchetype(opponent)) return false;
            return !opponent || visibleColumns.size === 0 || visibleColumns.has(opponent);
          }),
        };
      })
    : data.rows;

  return { ...data, columns, rows };
}

export function createStandardMatchupRouter(dependencies: StandardMatchupRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=600';
  const now = dependencies.now ?? Date.now;

  router.get('/standard/matchups', dependencies.accessGuard, async (request, response) => {
    const slice = parseStandardMatchupSlice(request.query as Record<string, unknown>);
    const sliceKey = standardMatchupSliceKey(slice);
    const timestamp = now();
    const cached = dependencies.memoryCache.get(sliceKey);
    if (cached && cached.expiresAt > timestamp) {
      return sendDatasetJsonCached(
        request,
        response,
        excludeOtherStandardMatchups(cached.data),
        cached.etag,
        cacheHeader,
        'memory',
      );
    }

    const key = `${dependencies.redisKey(slice)}:without-other-v3`;
    try {
      const redisCached = await dependencies.redisGet(key);
      if (redisCached) {
        const filteredData = excludeOtherStandardMatchups(redisCached.data);
        dependencies.memoryCache.set(sliceKey, {
          data: filteredData,
          etag: redisCached.etag,
          expiresAt: timestamp + dependencies.memoryTtlMs,
        });
        return sendDatasetJsonCached(request, response, filteredData, redisCached.etag, cacheHeader, 'redis');
      }
    } catch (error) {
      dependencies.onError?.('redis-read', error);
    }

    try {
      const [payload, translations] = await Promise.all([
        dependencies.fetchPayload(slice),
        dependencies.getTranslations(timestamp),
      ]);
      const data = excludeOtherStandardMatchups(dependencies.transform(payload, slice, translations));
      const updatedMs = data.updatedAt ? Date.parse(data.updatedAt) : Number.NaN;
      const updatedToken = Number.isFinite(updatedMs) ? updatedMs.toString(36) : timestamp.toString(36);
      const sliceToken = [slice.format, slice.rank, data.period ?? slice.period ?? 'default', slice.minGames].join('-');
      const etag = `"standard-matchups-v8-${sliceToken}-${updatedToken}-${data.rows.length}-${data.columns.length}-${data.translationSource}"`;
      dependencies.memoryCache.set(sliceKey, {
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
          { ...excludeOtherStandardMatchups(cached.data), warning: 'stale' },
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
