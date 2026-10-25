import { createMetaSliceCache } from '../constructedArchetypes/public.js';
import {
  metaCount, parseLiveStream, parseProfile, parseRows, parseSummary, parseDeck, type ArchetypeNamer,
} from './parsing.js';
import type { StreamerFilters, StreamerPage, StreamersPage } from './types.js';

export const STREAMERS_PAGE_SIZE = 24;
export const STREAMER_DECKS_PAGE_SIZE = 30;
/** Стримеры, игравшие за этот срок; остальные — только на своих страницах. */
const ACTIVE_DAYS = 30;
const LIVE_LIMIT = 60;
const MAX_OFFSET = 5_000;

export class StreamerNotFoundError extends Error {}

export type StreamersServiceDependencies = {
  /** Корень hs-data-api. */
  baseUrl: string;
  fetchJson?: (url: string) => Promise<unknown>;
  /** Русские имена архетипов; без них остаются имена HSGuru. */
  loadNamer?: () => Promise<ArchetypeNamer>;
  ttlMs?: number;
  now?: () => number;
  onError?: (key: string, error: unknown) => void;
};

/** Анонимное чтение hs-data-api: `404` — нет такого стримера, прочие ошибки — исключение. */
export async function fetchStreamersJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) {
    void response.body?.cancel().catch(() => undefined);
    throw new StreamerNotFoundError('streamer not found');
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`streamers HTTP ${response.status}`);
  }
  return response.json();
}

function filterQuery(filters: StreamerFilters, query: URLSearchParams): URLSearchParams {
  if (filters.format) query.set('format', filters.format);
  if (filters.classKey) query.set('player_class', filters.classKey.toUpperCase());
  return query;
}

/**
 * Страницы «Стримеры» и «Стример» из hs-data-api. hs-data-api обновляет
 * эфиры каждые пять минут, поэтому срез живёт минуту; истёкший срез
 * отдаётся сразу, пока в фоне идёт одно обновление.
 */
export function createStreamersService(dependencies: StreamersServiceDependencies) {
  const base = dependencies.baseUrl.replace(/\/+$/, '');
  const fetchJson = dependencies.fetchJson ?? fetchStreamersJson;
  const namer = async (): Promise<ArchetypeNamer> => {
    try {
      return (await dependencies.loadNamer?.()) ?? (name => name);
    } catch {
      return name => name;
    }
  };
  const cache = <T>() => createMetaSliceCache<T>({
    ttlMs: dependencies.ttlMs ?? 60_000, staleMs: 10 * 60_000, retryMs: 30_000, timeoutMs: 15_000,
    now: dependencies.now, onRefreshError: dependencies.onError,
  });
  const lists = cache<StreamersPage>();
  const pages = cache<StreamerPage>();

  async function readList(filters: StreamerFilters, offset: number): Promise<StreamersPage> {
    const query = filterQuery(filters, new URLSearchParams({
      days: String(ACTIVE_DAYS), limit: String(STREAMERS_PAGE_SIZE), offset: String(offset), decks: '3',
    }));
    const [name, list, live] = await Promise.all([
      namer(),
      fetchJson(`${base}/v1/hsguru/streamers?${query}`),
      offset === 0 ? fetchJson(`${base}/v1/hsguru/streaming-now?limit=${LIVE_LIMIT}`) : null,
    ]);
    return {
      live: live ? parseRows(live, row => parseLiveStream(row, name)) : [],
      streamers: parseRows(list, row => parseSummary(row, name)),
      total: metaCount(list), offset, filters,
    };
  }

  async function readStreamer(slug: string, filters: StreamerFilters, offset: number): Promise<StreamerPage> {
    const query = filterQuery(filters, new URLSearchParams({ limit: String(STREAMER_DECKS_PAGE_SIZE), offset: String(offset) }));
    const path = `${base}/v1/hsguru/streamers/${encodeURIComponent(slug)}`;
    const [name, profile, decks] = await Promise.all([namer(), fetchJson(path), fetchJson(`${path}/decks?${query}`)]);
    const streamer = parseProfile((profile as { data?: unknown } | null)?.data, name);
    if (!streamer) throw new Error('streamers: invalid streamer response');
    return { streamer, decks: parseRows(decks, row => parseDeck(row, name)), total: metaCount(decks), offset, filters };
  }

  return {
    loadList(filters: StreamerFilters, offset = 0): Promise<StreamersPage> {
      const at = Math.min(Math.max(0, offset), MAX_OFFSET);
      return lists.load(`${filters.format ?? '*'}|${filters.classKey ?? '*'}|${at}`, () => readList(filters, at));
    },
    loadStreamer(slug: string, filters: StreamerFilters, offset = 0): Promise<StreamerPage> {
      const at = Math.min(Math.max(0, offset), MAX_OFFSET);
      return pages.load(`${slug}|${filters.format ?? '*'}|${filters.classKey ?? '*'}|${at}`, () => readStreamer(slug, filters, at));
    },
  };
}
