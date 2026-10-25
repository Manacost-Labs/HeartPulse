import type { LeaderboardStreamer } from './types.js';

/** Сколько страниц по 100 стримеров читать: каталог HSGuru — около 225 человек. */
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
/** Каталог меняется медленно (новый стример — раз в несколько дней), а читается при каждой таблице. */
const TTL_MS = 30 * 60_000;
/** После сбоя не спрашиваем hs-data-api на каждую таблицу. */
const RETRY_MS = 60_000;
/**
 * Twitch-ник без «HS», «TV» и подобных хвостов сравнивается только с длинным
 * ником Blizzard: «TheoHS_» → «Theo» совпал бы с любым Theo в таблице.
 */
const LOOSE_MIN_LENGTH = 6;
const AFFIXES = /^(?:ttv|hs|twitch)|(?:hs|tv|ttv|twitch)$/g;

/** Ключ сравнения ников: Blizzard не разрешает в BattleTag ни «_», ни пробелы, ни регистр. */
export function streamerNameKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function looseKey(name: string): string {
  return streamerNameKey(name).replace(AFFIXES, '');
}

type CatalogEntry = { slug: string; displayName: string; login: string | null };

function catalogEntries(payload: unknown): CatalogEntry[] {
  const rows = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) throw new Error('leaderboards: streamer catalog is not a list');
  return rows.flatMap(row => {
    const value = row as Record<string, unknown> | null;
    const slug = typeof value?.slug === 'string' ? value.slug.trim() : '';
    const displayName = typeof value?.display_name === 'string' ? value.display_name.trim() : '';
    if (!slug || !displayName || !/^[\p{L}\p{N}_-]{1,64}$/u.test(slug)) return [];
    return [{ slug, displayName, login: typeof value?.login === 'string' ? value.login : null }];
  });
}

/**
 * Ник Blizzard → стример. Точное совпадение (без регистра и «_») важнее
 * совпадения без хвостов; ключ, который подходит двум разным стримерам,
 * не размечается вовсе — значок у чужого ника хуже, чем его отсутствие.
 */
export function buildStreamerIndex(entries: CatalogEntry[]): Map<string, LeaderboardStreamer> {
  const exact = new Map<string, LeaderboardStreamer | null>();
  const loose = new Map<string, LeaderboardStreamer | null>();
  const add = (map: Map<string, LeaderboardStreamer | null>, key: string, streamer: LeaderboardStreamer) => {
    const known = map.get(key);
    map.set(key, known === undefined || known?.slug === streamer.slug ? streamer : null);
  };
  for (const entry of entries) {
    const streamer = { slug: entry.slug, name: entry.displayName };
    for (const name of [entry.displayName, entry.login]) {
      if (!name) continue;
      const key = streamerNameKey(name);
      if (key.length >= 3) add(exact, key, streamer);
      const trimmed = looseKey(name);
      if (trimmed !== key && trimmed.length >= LOOSE_MIN_LENGTH) add(loose, trimmed, streamer);
    }
  }
  const index = new Map<string, LeaderboardStreamer>();
  for (const [key, streamer] of loose) if (streamer) index.set(key, streamer);
  for (const [key, streamer] of exact) {
    if (streamer) index.set(key, streamer);
    else index.delete(key);
  }
  return index;
}

export type StreamerLookup = (name: string) => LeaderboardStreamer | null;

/**
 * Каталог стримеров HSGuru из hs-data-api (`/v1/hsguru/streamers`) для значка
 * у ников таблицы. Значок — украшение: сбой каталога никогда не роняет
 * таблицу, а оставляет прежний каталог или пустой.
 */
export function createStreamerDirectory({ baseUrl, fetchJson, now = Date.now, firstWaitMs = 1500 }: {
  baseUrl: string;
  fetchJson: (url: string) => Promise<unknown>;
  now?: () => number;
  /** Сколько первая таблица ждёт каталог; не успел — таблица уходит без значков. */
  firstWaitMs?: number;
}) {
  let index = new Map<string, LeaderboardStreamer>();
  let loaded = false;
  let expiresAt = 0;
  let loading: Promise<void> | null = null;

  const load = async () => {
    const entries: CatalogEntry[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const search = new URLSearchParams({ days: '0', decks: '0', limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      const rows = catalogEntries(await fetchJson(`${baseUrl}/v1/hsguru/streamers?${search}`));
      entries.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
    index = buildStreamerIndex(entries);
    expiresAt = now() + TTL_MS;
  };

  return async function lookup(): Promise<StreamerLookup> {
    if (now() >= expiresAt && !loading) {
      loading = load()
        .then(() => { loaded = true; })
        .catch(() => { expiresAt = now() + RETRY_MS; })
        .finally(() => { loading = null; });
    }
    // Устаревший каталог отдаётся сразу, обновление идёт в фоне; ждём только самый первый.
    if (!loaded && loading) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([loading, new Promise(resolve => { timer = setTimeout(resolve, firstWaitMs); })]);
      clearTimeout(timer);
    }
    const current = index;
    return name => current.get(streamerNameKey(name)) ?? null;
  };
}
