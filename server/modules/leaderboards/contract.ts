import {
  LEADERBOARD_MODES, LEADERBOARD_REGIONS,
  type LeaderboardBoard, type LeaderboardMode, type LeaderboardPlayer, type LeaderboardPlayerHit, type LeaderboardPlayerSeason,
  type LeaderboardRegion, type LeaderboardSeason, type LeaderboardSeasonCatalog, type LeaderboardSnapshot, type LeaderboardStats,
  type LeaderboardTable,
} from './types.js';

export * from './types.js';

/** Ответ hs-data-api не совпал с контрактом /v1/leaderboards*: страница его не показывает. */
export class LeaderboardContractError extends Error {}

type Json = Record<string, unknown>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Никнейм Blizzard без номера BattleTag; управляющие символы не показываем.
const CONTROL = /[\u0000-\u001f\u007f]/g;

function fail(what: string): never {
  throw new LeaderboardContractError(`leaderboards: ${what}`);
}

function object(value: unknown, what: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${what} is not an object`);
  return value as Json;
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) fail(`${what} is not a list`);
  return value;
}

function integer(value: unknown, what: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) fail(`${what} is not an integer`);
  return value;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function day(value: unknown, what: string): string {
  if (typeof value !== 'string' || !DAY.test(value)) fail(`${what} is not a day`);
  return value;
}

function optionalDay(value: unknown): string | null {
  return typeof value === 'string' && DAY.test(value) ? value : null;
}

function timestamp(value: unknown, what: string): string {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time)) fail(`${what} is not a time`);
  return new Date(time).toISOString();
}

function name(value: unknown, what: string): string {
  const text = typeof value === 'string' ? value.replace(CONTROL, '').trim().slice(0, 64) : '';
  if (!text) fail(`${what} is empty`);
  return text;
}

export function isLeaderboardMode(value: unknown): value is LeaderboardMode {
  return typeof value === 'string' && (LEADERBOARD_MODES as readonly string[]).includes(value);
}

export function isLeaderboardRegion(value: unknown): value is LeaderboardRegion {
  return typeof value === 'string' && (LEADERBOARD_REGIONS as readonly string[]).includes(value);
}

function mode(value: unknown): LeaderboardMode {
  if (!isLeaderboardMode(value)) fail('unknown mode');
  return value;
}

function region(value: unknown): LeaderboardRegion {
  if (!isLeaderboardRegion(value)) fail('unknown region');
  return value;
}

function data(payload: unknown): Json {
  return object(object(payload, 'response').data, 'data');
}

function board(value: unknown): LeaderboardBoard {
  const raw = object(value, 'board');
  return {
    mode: mode(raw.mode), region: region(raw.region), season: integer(raw.season_id, 'season'),
    seasonStart: optionalDay(raw.season_start), latest: raw.is_latest === true, final: raw.final === true, rated: raw.rated === true,
  };
}

function snapshot(value: unknown): LeaderboardSnapshot {
  const raw = object(value, 'snapshot');
  return {
    day: day(raw.day, 'snapshot day'), capturedAt: timestamp(raw.captured_at, 'captured_at'),
    players: integer(raw.total_size, 'total_size'), stored: integer(raw.stored_rows, 'stored_rows'),
    truncated: raw.truncated === true, stale: raw.stale === true,
  };
}

/** Каталог сезонов: только регионы и сезоны с сохранённой таблицей, неизвестные режимы пропускаются. */
export function parseSeasonCatalog(payload: unknown): LeaderboardSeasonCatalog {
  const modes: LeaderboardSeasonCatalog['modes'] = [];
  for (const entry of list(data(payload).modes, 'modes')) {
    const raw = object(entry, 'mode');
    if (!isLeaderboardMode(raw.mode)) continue;
    const regionsRaw = object(raw.regions, 'regions');
    const regions = Object.fromEntries(LEADERBOARD_REGIONS.map(key => {
      const seasons = regionsRaw[key] ? list(object(regionsRaw[key], key).seasons, 'seasons') : [];
      const stored: LeaderboardSeason[] = seasons
        .map(item => object(item, 'season'))
        .filter(item => item.has_data === true)
        .map(item => ({
          id: integer(item.season_id, 'season_id'), start: optionalDay(item.season_start), latest: item.is_latest === true,
          final: item.final === true, players: number(item.total_size),
        }))
        .sort((left, right) => right.id - left.id);
      return [key, stored];
    })) as Record<LeaderboardRegion, LeaderboardSeason[]>;
    modes.push({ mode: raw.mode, rated: raw.rated === true, regions });
  }
  return { modes: LEADERBOARD_MODES.flatMap(key => modes.filter(item => item.mode === key)) };
}

export function parseLeaderboardTable(payload: unknown, page: number, pageSize: number): LeaderboardTable {
  const raw = data(payload);
  const total = integer(raw.total, 'total');
  const days = list(raw.days, 'days');
  const current = snapshot(raw.snapshot);
  return {
    board: board(raw.board), snapshot: current,
    query: typeof raw.query === 'string' ? raw.query : null,
    total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    hasPrevious: days.some(value => typeof value === 'string' && value < current.day),
    rows: list(raw.rows, 'rows').map(item => {
      const row = object(item, 'row');
      const previous = number(row.previous_rank);
      return { rank: integer(row.rank, 'rank', 1), name: name(row.name, 'name'), rating: number(row.rating), previousRank: previous !== null && previous >= 1 ? previous : null };
    }),
  };
}

export function parseLeaderboardStats(payload: unknown): LeaderboardStats {
  const raw = data(payload);
  const rating = raw.rating ? object(raw.rating, 'rating') : null;
  const ratingMin = rating ? number(rating.min) : null;
  const ratingMax = rating ? number(rating.max) : null;
  const ratingMean = rating ? number(rating.mean) : null;
  return {
    board: board(raw.board), snapshot: snapshot(raw.snapshot), topRating: number(raw.top_rating),
    thresholds: list(raw.thresholds, 'thresholds').map(item => {
      const threshold = object(item, 'threshold');
      return { rank: integer(threshold.rank, 'threshold rank', 1), reached: threshold.reached === true, rating: number(threshold.rating) };
    }),
    rating: ratingMin !== null && ratingMax !== null && ratingMean !== null
      ? { min: ratingMin, max: ratingMax, mean: ratingMean, median: number(rating?.median) }
      : null,
    histogram: Array.isArray(raw.histogram)
      ? raw.histogram.map(item => {
        const bucket = object(item, 'bucket');
        return { from: number(bucket.from) ?? 0, to: number(bucket.to) ?? 0, players: integer(bucket.players, 'bucket players') };
      })
      : null,
    series: list(raw.series, 'series').map(item => {
      const point = object(item, 'series point');
      return {
        day: day(point.day, 'series day'), players: integer(point.total_size, 'series total_size'), top: number(point.rating_at_1),
        at100: number(point.rating_at_100), at1000: number(point.rating_at_1000), at5000: number(point.rating_at_5000),
      };
    }),
  };
}

export function parseLeaderboardPlayer(payload: unknown): LeaderboardPlayer {
  const raw = data(payload);
  const player = object(raw.player, 'player');
  const seasons: LeaderboardPlayerSeason[] = list(raw.seasons, 'seasons').map(item => {
    const season = object(item, 'player season');
    return {
      mode: mode(season.mode), season: integer(season.season_id, 'season_id'), seasonStart: optionalDay(season.season_start),
      latest: season.is_latest === true, final: season.final === true, rated: season.rated === true,
      bestRank: integer(season.best_rank, 'best_rank', 1), bestDay: day(season.best_day, 'best_day'),
      lastRank: integer(season.last_rank, 'last_rank', 1), lastRating: number(season.last_rating), lastDay: day(season.last_day, 'last_day'),
      inLatest: season.in_latest_snapshot === true,
      series: list(season.series, 'series').map(point => {
        const value = object(point, 'player point');
        return {
          day: day(value.day, 'point day'), rank: integer(value.rank, 'point rank', 1), rating: number(value.rating),
          players: integer(value.total_size, 'point total_size'), final: value.final === true,
        };
      }),
    };
  });
  return { region: region(player.region), name: name(player.name, 'player name'), sharedName: raw.shared_name === true, seasons };
}

export function parsePlayerHits(payload: unknown): LeaderboardPlayerHit[] {
  return list(object(payload, 'response').data, 'players').map(item => {
    const hit = object(item, 'player');
    return {
      region: region(hit.region), name: name(hit.name, 'player name'),
      current: list(hit.current, 'current').flatMap(entry => {
        const place = object(entry, 'place');
        if (!isLeaderboardMode(place.mode)) return [];
        return [{ mode: place.mode, season: integer(place.season_id, 'season_id'), rank: integer(place.rank, 'rank', 1), rating: number(place.rating) }];
      }),
    };
  });
}
