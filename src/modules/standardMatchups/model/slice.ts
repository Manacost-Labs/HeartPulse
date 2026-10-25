import {
  DEFAULT_STANDARD_MATCHUPS_SLICE, STANDARD_MATCHUPS_MIN_GAMES, STANDARD_MATCHUPS_RANKS,
  type StandardMatchupsRank, type StandardMatchupsSlice,
} from './types';

const PERIOD = /^[a-z0-9_.]{1,64}$/;
const RANKS = new Set<string>(STANDARD_MATCHUPS_RANKS);
const MIN_GAMES = new Set<number>(STANDARD_MATCHUPS_MIN_GAMES);

/** The page's query parameters: the same names as the API (`format`, `rank`, `period`, `min_games`). */
export function readStandardMatchupsSlice(search: string): StandardMatchupsSlice {
  const params = new URLSearchParams(search);
  const rank = params.get('rank') ?? '';
  const period = params.get('period') ?? '';
  const minGames = Number(params.get('min_games'));
  return {
    format: params.get('format') === 'wild' ? 'wild' : 'standard',
    rank: RANKS.has(rank) ? rank as StandardMatchupsRank : DEFAULT_STANDARD_MATCHUPS_SLICE.rank,
    period: PERIOD.test(period) ? period : null,
    minGames: MIN_GAMES.has(minGames) ? minGames : DEFAULT_STANDARD_MATCHUPS_SLICE.minGames,
  };
}

/** The search string with the slice: defaults are left out, other parameters are kept. */
export function writeStandardMatchupsSlice(search: string, slice: StandardMatchupsSlice): string {
  const params = new URLSearchParams(search);
  const values: Array<[string, string | null]> = [
    ['format', slice.format === DEFAULT_STANDARD_MATCHUPS_SLICE.format ? null : slice.format],
    ['rank', slice.rank === DEFAULT_STANDARD_MATCHUPS_SLICE.rank ? null : slice.rank],
    ['period', slice.period],
    ['min_games', slice.minGames === DEFAULT_STANDARD_MATCHUPS_SLICE.minGames ? null : String(slice.minGames)],
  ];
  for (const [name, value] of values) {
    if (value === null) params.delete(name);
    else params.set(name, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Query of the site's `/api/standard/matchups` for a slice. */
export function standardMatchupsSliceQuery(slice: StandardMatchupsSlice): string {
  const params = new URLSearchParams({ format: slice.format, rank: slice.rank, min_games: String(slice.minGames) });
  if (slice.period) params.set('period', slice.period);
  return params.toString();
}

export function standardMatchupsSliceKey(slice: StandardMatchupsSlice): string {
  return [slice.format, slice.rank, slice.period ?? 'default', slice.minGames].join(':');
}

export function sameStandardMatchupsSlice(a: StandardMatchupsSlice, b: StandardMatchupsSlice): boolean {
  return standardMatchupsSliceKey(a) === standardMatchupsSliceKey(b);
}
