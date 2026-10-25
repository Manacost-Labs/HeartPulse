import { inferStandardMetaClass, normalizeStandardMetaClass } from './standardMetaClasses.js';

export type StandardMatchupFormat = 'standard' | 'wild';

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

export type HsguruMatchupTransformOptions = {
  formatLabel: string;
  sourceId: string;
  translationSource: string;
  translate: (archetype: string) => string;
};


export function parseMatchupNumber(value: unknown): number | null {
  const raw = String(value ?? '').replace('%', '').replace(',', '.').trim();
  if (!raw || raw === '—' || raw === '-') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
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

type SliceTranslations = { source?: unknown; map?: Record<string, string> };

/**
 * The router's source and transform for the unified hs-data-api matchups, so
 * the composition root only names its origin, fetcher and labels.
 */
export function standardMatchupSliceDependencies(options: {
  origin: string;
  fetchJson: (url: string, timeoutMs?: number) => Promise<unknown>;
  formatLabel: (format: StandardMatchupFormat) => string;
  translate: (archetype: string, map: Record<string, string>) => string;
}): {
  fetchPayload: (slice: StandardMatchupSlice) => Promise<unknown>;
  transform: (payload: unknown, slice: StandardMatchupSlice, translations: SliceTranslations | undefined)
    => ReturnType<typeof transformHsguruMatchupSlice>;
} {
  const origin = options.origin.replace(/\/+$/, '');
  return {
    fetchPayload: slice => options.fetchJson(`${origin}/${standardMatchupSlicePath(slice)}`, 20_000),
    transform: (payload, slice, translations) => transformHsguruMatchupSlice(payload as HsguruMatchupSlicePayload, slice, {
      formatLabel: options.formatLabel(slice.format),
      sourceId: 'hsguru_matchups',
      translationSource: String(translations?.source ?? ''),
      translate: name => options.translate(name, translations?.map ?? {}),
    }),
  };
}
