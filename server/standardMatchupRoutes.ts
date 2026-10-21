import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import { inferStandardMetaClass, type StandardMetaClassKey } from './standardMetaClasses.js';

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
    const format: StandardMatchupFormat = request.query.format === 'wild' ? 'wild' : 'standard';
    const timestamp = now();
    const cached = dependencies.memoryCache.get(format);
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

    const key = `${dependencies.redisKey(format)}:without-other-v2`;
    try {
      const redisCached = await dependencies.redisGet(key);
      if (redisCached) {
        const filteredData = excludeOtherStandardMatchups(redisCached.data);
        dependencies.memoryCache.set(format, {
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
        dependencies.fetchPayload(format),
        dependencies.getTranslations(timestamp),
      ]);
      const data = excludeOtherStandardMatchups(dependencies.transform(payload, format, translations));
      const updatedMs = data.updatedAt ? Date.parse(data.updatedAt) : Number.NaN;
      const updatedToken = Number.isFinite(updatedMs) ? updatedMs.toString(36) : timestamp.toString(36);
      const etag = `"standard-matchups-v7-${format}-${updatedToken}-${data.rows.length}-${data.columns.length}-${data.translationSource}"`;
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
