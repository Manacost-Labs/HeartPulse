import {
  LEADERBOARD_REGIONS, parseLeaderboardPlayer, parseLeaderboardStats, parseLeaderboardTable, parsePlayerHits, parseSeasonCatalog,
  type LeaderboardMode, type LeaderboardPlayer, type LeaderboardPlayerHit, type LeaderboardRegion, type LeaderboardSeasonCatalog,
  type LeaderboardStats, type LeaderboardTable,
} from './contract.js';
import { createStreamerDirectory, type StreamerLookup } from './streamers.js';

/** Строк на странице таблицы: столько показывает страница сайта. */
export const LEADERBOARD_PAGE_SIZE = 50;

export type BoardQuery = { mode: LeaderboardMode; region: LeaderboardRegion; season: number | null };
export type TableQuery = BoardQuery & { page: number; query: string | null };

export type LeaderboardsServiceDependencies = {
  /** Корень hs-data-api (`HS_DATA_API_BASE_URL`). */
  baseUrl: string;
  /** JSON ответа; `null` — hs-data-api ответил 404 (таблица ещё не собрана или игрока нет). */
  fetchJson?: (url: string) => Promise<unknown>;
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
  /** Каталог стримеров для значка у ника; по умолчанию — `/v1/hsguru/streamers` того же hs-data-api. */
  streamers?: () => Promise<StreamerLookup>;
};

class NotFound extends Error {}

/** Анонимное чтение hs-data-api: 404 — «нет такой таблицы или игрока», остальные ошибки — исключение. */
export async function fetchLeaderboardJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`leaderboards HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Таблицы лидеров hs-data-api с коротким кешем по URL. Снимки меняются
 * четыре раза в сутки, поэтому две минуты кеша не делают страницу
 * заметно старее, а повторные просмотры одной страницы таблицы и
 * параллельные запросы сервера и браузера читают hs-data-api один раз.
 */
export function createLeaderboardsService(dependencies: LeaderboardsServiceDependencies) {
  const base = `${dependencies.baseUrl.replace(/\/+$/, '')}/v1/leaderboards`;
  const fetchJson = dependencies.fetchJson ?? fetchLeaderboardJson;
  const ttlMs = dependencies.ttlMs ?? 120_000;
  const maxEntries = dependencies.maxEntries ?? 500;
  const now = dependencies.now ?? Date.now;
  const cache = new Map<string, { value: Promise<unknown>; expiresAt: number }>();

  const read = <T>(path: string, params: Record<string, string | number | null>, parse: (payload: unknown) => T): Promise<T | null> => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== null && value !== '') search.set(key, String(value));
    const url = `${base}${path}${search.size ? `?${search}` : ''}`;
    const cached = cache.get(url);
    if (cached && cached.expiresAt > now()) return cached.value as Promise<T | null>;
    const value = fetchJson(url).then(payload => {
      if (payload === null) throw new NotFound();
      return parse(payload);
    });
    cache.set(url, { value, expiresAt: now() + ttlMs });
    // Неудача не кешируется: следующий просмотр спросит снова.
    value.catch(() => { if (cache.get(url)?.value === value) cache.delete(url); });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
    return value.catch(error => {
      if (error instanceof NotFound) return null;
      throw error;
    });
  };

  const streamers = dependencies.streamers ?? createStreamerDirectory({
    baseUrl: dependencies.baseUrl.replace(/\/+$/, ''), fetchJson, now,
  });
  const readPlayer = (region: LeaderboardRegion, name: string) => read('/player', { region, name }, parseLeaderboardPlayer);

  return {
    seasons: (): Promise<LeaderboardSeasonCatalog | null> => read('/seasons', {}, parseSeasonCatalog),
    // Значок стримера ставится поверх кеша таблицы: каталог обновляется отдельно и реже.
    table: async ({ mode, region, season, page, query }: TableQuery): Promise<LeaderboardTable | null> => {
      const [table, streamer] = await Promise.all([read('', {
        mode, region, season, q: query, limit: LEADERBOARD_PAGE_SIZE, offset: (page - 1) * LEADERBOARD_PAGE_SIZE,
      }, payload => parseLeaderboardTable(payload, page, LEADERBOARD_PAGE_SIZE)), streamers()]);
      return table && { ...table, rows: table.rows.map(row => ({ ...row, streamer: streamer(row.name) })) };
    },
    stats: ({ mode, region, season }: BoardQuery): Promise<LeaderboardStats | null> => read('/stats', { mode, region, season }, parseLeaderboardStats),
    /**
     * Игрок региона и регионы, где есть такой же ник. Соседние регионы читаются
     * параллельно и необязательны: их сбой не мешает показать сам профиль.
     */
    player: async (region: LeaderboardRegion, name: string): Promise<LeaderboardPlayer | null> => {
      const others = LEADERBOARD_REGIONS.filter(other => other !== region);
      const [player, streamer, ...found] = await Promise.all([
        readPlayer(region, name), streamers(),
        ...others.map(other => readPlayer(other, name).then(value => Boolean(value), () => false)),
      ]);
      if (!player) return null;
      return {
        ...player,
        regions: LEADERBOARD_REGIONS.filter(key => key === region || found[others.indexOf(key)]),
        streamer: streamer(player.name),
      };
    },
    players: (query: string, region: LeaderboardRegion | null): Promise<LeaderboardPlayerHit[] | null> => read('/players', { q: query, region, limit: 8 }, parsePlayerHits),
  };
}

export type LeaderboardsService = ReturnType<typeof createLeaderboardsService>;
