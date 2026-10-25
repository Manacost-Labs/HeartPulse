import { createMetaSliceCache } from '../constructedArchetypes/public.js';
import { record } from './parsing.js';
import type { StreamerFormat, StreamerLadder } from './types.js';

type Region = StreamerLadder['region'];
type Mode = StreamerLadder['mode'];
/** Ник в таблицах: регионы, где он есть, и места в таблицах текущего сезона. */
export type LadderPlayer = { regions: Region[]; current: { region: Region; mode: string; rank: number }[] };

const REGIONS: readonly Region[] = ['EU', 'US', 'AP'];
// Ник BattleTag — 3–12 букв и цифр: каналы с `_` и точками в таблицах не ищем.
const BATTLETAG = /^[\p{L}\p{N}]{3,12}$/u;

function rank(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function region(value: unknown): Region | null {
  return REGIONS.find(item => item === value) ?? null;
}

export function ladderMode(format: StreamerFormat | null): Mode {
  return format === 'wild' ? 'wild' : 'standard';
}

export function ladderName(name: string): string | null {
  return BATTLETAG.test(name) ? name : null;
}

/**
 * Строки `/v1/leaderboards/players?q=` с тем же ником без учёта регистра.
 * Поиск идёт по префиксу, поэтому «Theo» не совпадает с «TheoHS».
 */
export function parseLadderPlayer(payload: unknown, name: string): LadderPlayer {
  const wanted = name.toLowerCase();
  const found: LadderPlayer = { regions: [], current: [] };
  for (const item of Array.isArray(record(payload).data) ? record(payload).data as unknown[] : []) {
    const row = record(item);
    const at = region(row.region);
    if (!at || typeof row.name !== 'string' || row.name.toLowerCase() !== wanted) continue;
    if (!found.regions.includes(at)) found.regions.push(at);
    for (const place of Array.isArray(row.current) ? row.current : []) {
      const value = rank(record(place).rank);
      const mode = record(place).mode;
      if (value && typeof mode === 'string') found.current.push({ region: at, mode, rank: value });
    }
  }
  return found;
}

/** Лучшее место текущего сезона в режиме среди регионов. */
export function currentPlace(player: LadderPlayer, mode: Mode): StreamerLadder | null {
  const best = player.current.filter(place => place.mode === mode).sort((left, right) => left.rank - right.rank)[0];
  return best ? { rank: best.rank, region: best.region, mode, current: true, seasonStart: null } : null;
}

type SeasonPlace = StreamerLadder & { seasonId: number };

/** Последний сохранённый сезон режима из `/v1/leaderboards/player`: итоговое (последнее) место. */
export function lastSeasonPlace(payload: unknown, mode: Mode, at: Region): SeasonPlace | null {
  let latest: SeasonPlace | null = null;
  for (const item of Array.isArray(record(record(payload).data).seasons) ? record(record(payload).data).seasons as unknown[] : []) {
    const season = record(item);
    const seasonId = rank(season.season_id);
    const value = rank(season.last_rank);
    if (season.mode !== mode || !seasonId || !value || (latest && latest.seasonId >= seasonId)) continue;
    const start = typeof season.season_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(season.season_start) ? season.season_start : null;
    latest = { rank: value, region: at, mode, current: season.is_latest === true && season.final !== true, seasonStart: start, seasonId };
  }
  return latest;
}

function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(resolve => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

/** Ждёт не дольше `ms`; опоздавшее чтение доходит в кеш для следующего среза. */
function withinBudget<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), ms);
    timer.unref?.();
  });
  return Promise.race([promise.catch(() => null), budget]).finally(() => clearTimeout(timer));
}

export type LadderLookupDependencies = {
  base: string;
  fetchJson: (url: string) => Promise<unknown>;
  now?: () => number;
  onError?: (key: string, error: unknown) => void;
};

/**
 * Места стримеров в таблицах лидеров Blizzard (`/v1/leaderboards/players`
 * и `/player`). Таблицы обновляются раз в несколько часов, поэтому ник
 * живёт в кеше полчаса, а чтения идут не больше шести сразу.
 */
export function createLadderLookup({ base, fetchJson, now, onError }: LadderLookupDependencies) {
  const run = limiter(6);
  const options = { ttlMs: 30 * 60_000, staleMs: 6 * 60 * 60_000, retryMs: 5 * 60_000, timeoutMs: 10_000, now, onRefreshError: onError };
  const players = createMetaSliceCache<LadderPlayer>(options);
  const seasons = createMetaSliceCache<SeasonPlace | null>(options);

  const player = (name: string) => players.load(name.toLowerCase(), async () => parseLadderPlayer(
    await run(() => fetchJson(`${base}/v1/leaderboards/players?${new URLSearchParams({ q: name, limit: '10' })}`)), name,
  ));
  const season = (name: string, at: Region, mode: Mode) => seasons.load(`${name.toLowerCase()}|${at}|${mode}`, async () => lastSeasonPlace(
    await run(() => fetchJson(`${base}/v1/leaderboards/player?${new URLSearchParams({ name, region: at, mode })}`)), mode, at,
  ));

  async function profile(name: string, mode: Mode): Promise<StreamerLadder | null> {
    const found = await player(name);
    const current = currentPlace(found, mode);
    if (current) return current;
    const places = (await Promise.all(found.regions.map(at => season(name, at, mode).catch(() => null))))
      .filter((place): place is SeasonPlace => place !== null);
    const latest = Math.max(0, ...places.map(place => place.seasonId));
    const best = places.filter(place => place.seasonId === latest).sort((left, right) => left.rank - right.rank)[0];
    return best ? { rank: best.rank, region: best.region, mode: best.mode, current: best.current, seasonStart: best.seasonStart } : null;
  }

  return {
    /** Места текущего сезона для карточек, по имени в нижнем регистре. */
    async current(names: string[], mode: Mode, budgetMs: number): Promise<Map<string, StreamerLadder>> {
      const searchable = [...new Set(names.map(ladderName).filter((name): name is string => name !== null))];
      const places = await Promise.all(searchable.map(async name => {
        const found = await withinBudget(player(name), budgetMs);
        return [name.toLowerCase(), found ? currentPlace(found, mode) : null] as const;
      }));
      return new Map(places.filter((entry): entry is readonly [string, StreamerLadder] => entry[1] !== null));
    },
    /** Место на странице стримера: текущий сезон, иначе итог последнего сохранённого. */
    profile(name: string, mode: Mode, budgetMs: number): Promise<StreamerLadder | null> {
      const searchable = ladderName(name);
      return searchable ? withinBudget(profile(searchable, mode), budgetMs) : Promise.resolve(null);
    },
  };
}
