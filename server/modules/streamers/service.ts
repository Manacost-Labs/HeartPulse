import { createMetaSliceCache } from '../constructedArchetypes/public.js';
import { createLadderLookup, ladderMode } from './ladder.js';
import {
  metaCount, parseLiveStream, parseProfile, parseRows, parseSummary, parseDeck, type ArchetypeNamer,
} from './parsing.js';
import type { StreamerFilters, StreamerPage, StreamersFilters, StreamersPage, StreamerWeek } from './types.js';
import { streamerWeek } from './week.js';

export const STREAMERS_PAGE_SIZE = 24;
export const STREAMER_DECKS_PAGE_SIZE = 30;
/** Стримеры, игравшие за этот срок; остальные — только на своих страницах. */
const ACTIVE_DAYS = 30;
const LIVE_LIMIT = 60;
const MAX_OFFSET = 5_000;
const WEEK_DAYS = 7;
const WEEK_DECKS = 200;
/** Поиски по нику живут в своём кеше и сбрасываются, когда их набирается столько. */
const MAX_SEARCH_SLICES = 200;
/** Сколько срез ждёт мест в таблицах лидеров; остальные дойдут к следующему срезу. */
const LADDER_BUDGET_MS = 700;

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
  const searches = cache<StreamersPage>();
  const pages = cache<StreamerPage>();
  const ladders = createLadderLookup({ base, fetchJson, now: dependencies.now, onError: dependencies.onError });

  async function readList(filters: StreamersFilters, offset: number): Promise<StreamersPage> {
    const query = filterQuery(filters, new URLSearchParams({
      days: String(ACTIVE_DAYS), limit: String(STREAMERS_PAGE_SIZE), offset: String(offset), decks: '8', sort: filters.sort,
    }));
    if (filters.language) query.set('language', filters.language);
    if (filters.live) query.set('live', 'true');
    if (filters.query) query.set('q', filters.query);
    const [name, list, live] = await Promise.all([
      namer(),
      fetchJson(`${base}/v1/hsguru/streamers?${query}`),
      offset === 0 ? fetchJson(`${base}/v1/hsguru/streaming-now?limit=${LIVE_LIMIT}`) : null,
    ]);
    const streamers = parseRows(list, row => parseSummary(row, name));
    const places = await ladders.current(streamers.map(streamer => streamer.name), ladderMode(filters.format), LADDER_BUDGET_MS);
    return {
      live: live ? parseRows(live, row => parseLiveStream(row, name)) : [],
      streamers: streamers.map(streamer => ({ ...streamer, ladder: places.get(streamer.name.toLowerCase()) ?? null })),
      total: metaCount(list), offset, filters,
    };
  }

  /** Неделя не обязательна странице: без неё стример всё равно открывается. */
  async function readWeek(path: string): Promise<unknown> {
    try {
      return await fetchJson(`${path}/decks?days=${WEEK_DAYS}&limit=${WEEK_DECKS}`);
    } catch (error) {
      dependencies.onError?.(`${path}|week`, error);
      return null;
    }
  }

  async function readStreamer(slug: string, filters: StreamerFilters, offset: number): Promise<StreamerPage> {
    const query = filterQuery(filters, new URLSearchParams({ limit: String(STREAMER_DECKS_PAGE_SIZE), offset: String(offset) }));
    const path = `${base}/v1/hsguru/streamers/${encodeURIComponent(slug)}`;
    const [name, profile, decks, week] = await Promise.all([
      namer(), fetchJson(path), fetchJson(`${path}/decks?${query}`), offset === 0 ? readWeek(path) : null,
    ]);
    const streamer = parseProfile((profile as { data?: unknown } | null)?.data, name);
    if (!streamer) throw new Error('streamers: invalid streamer response');
    const ladder = await ladders.profile(streamer.name, ladderMode(filters.format), LADDER_BUDGET_MS);
    return {
      streamer: { ...streamer, ladder },
      week: week ? weekOf(week, name) : null,
      decks: parseRows(decks, row => parseDeck(row, name)), total: metaCount(decks), offset, filters,
    };
  }

  function weekOf(payload: unknown, name: ArchetypeNamer): StreamerWeek | null {
    try {
      return streamerWeek(parseRows(payload, row => parseDeck(row, name)));
    } catch {
      return null;
    }
  }

  return {
    loadList(filters: StreamersFilters, offset = 0): Promise<StreamersPage> {
      const at = Math.min(Math.max(0, offset), MAX_OFFSET);
      const key = [filters.format ?? '*', filters.classKey ?? '*', filters.language ?? '*', filters.live ? 'live' : '*', filters.sort, at].join('|');
      if (!filters.query) return lists.load(key, () => readList(filters, at));
      // Поиск — свободный текст: его срезы не копятся без предела.
      if (searches.stats().entries >= MAX_SEARCH_SLICES) searches.clear();
      return searches.load(`${key}|${filters.query.toLowerCase()}`, () => readList(filters, at));
    },
    loadStreamer(slug: string, filters: StreamerFilters, offset = 0): Promise<StreamerPage> {
      const at = Math.min(Math.max(0, offset), MAX_OFFSET);
      return pages.load(`${slug}|${filters.format ?? '*'}|${filters.classKey ?? '*'}|${at}`, () => readStreamer(slug, filters, at));
    },
  };
}
