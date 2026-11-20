import type {
  StandardMetaCoin,
  StandardMetaData,
  StandardMetaFormat,
  StandardMetaMinGames,
  StandardMetaPeriod,
  StandardMetaServingRank,
} from '../../shared/standardMetaContract';

/**
 * The guest's first slice, read on the server from the open general slice
 * (apps/public-web/lib/publicStandardMetaTeaser.ts): the period the page
 * opens with and its data (every archetype row, without the paid columns).
 */
export type StandardMetaTeaserSeed = { period: StandardMetaPeriod; data: StandardMetaData };

/** The filters the meta page opens with; the server-rendered teaser is read for them. */
export const TEASER_SEED_FILTERS = { format: 'standard', rank: 'diamond_legend', coin: 'any_player', minGames: 100 } as const;

/** Identity of one meta request; a resolved key means its data is on screen. */
export function metaRequestKey(format: StandardMetaFormat, rank: StandardMetaServingRank, period: StandardMetaPeriod | null,
  coin: StandardMetaCoin, minGames: StandardMetaMinGames, revision: number, fullAccess: boolean): string {
  return `${format}:${rank}:${period ?? 'auto'}:${coin}:${minGames}:${revision}:${fullAccess ? 'full' : 'teaser'}`;
}

/** The request a server-rendered teaser answers, or '' when the viewer needs full data. */
export function teaserSeedKey(seed: StandardMetaTeaserSeed | null, fullAccess: boolean): string {
  return seed && !fullAccess
    ? metaRequestKey(seed.data.format, TEASER_SEED_FILTERS.rank, null, TEASER_SEED_FILTERS.coin,
      TEASER_SEED_FILTERS.minGames, 0, false)
    : '';
}

const RANKS = new Set<string>(['diamond', 'diamond_legend', 'legend', 'top_5k', 'top_legend']);
const COINS = new Set<string>(['any_player', 'on_coin', 'going_first']);
const FLOORS = new Set<number>([100, 250, 500, 1000, 2500, 5000]);
const PERIOD = /^[a-z0-9_.]{1,64}$/;

export type StandardMetaFilterQuery = {
  rank?: StandardMetaServingRank; coin?: StandardMetaCoin; minGames?: StandardMetaMinGames; period?: StandardMetaPeriod;
};

/** The subscriber's filters kept in the address, so another format opens with the same rank, period, coin and floor. */
export function readMetaFilterQuery(search: string): StandardMetaFilterQuery {
  const params = new URLSearchParams(search);
  const rank = params.get('rank') ?? '';
  const coin = params.get('coin') ?? '';
  const period = params.get('period') ?? '';
  const minGames = Number(params.get('min_games'));
  return {
    ...(RANKS.has(rank) ? { rank: rank as StandardMetaServingRank } : {}),
    ...(COINS.has(coin) ? { coin: coin as StandardMetaCoin } : {}),
    ...(FLOORS.has(minGames) ? { minGames: minGames as StandardMetaMinGames } : {}),
    ...(PERIOD.test(period) ? { period: period as StandardMetaPeriod } : {}),
  };
}

/** The query of the filters that differ from the page's defaults ('' when none). */
export function metaFilterSearch(filters: Required<Omit<StandardMetaFilterQuery, 'period'>> & { period: StandardMetaPeriod | null }): string {
  const params = new URLSearchParams();
  if (filters.rank !== TEASER_SEED_FILTERS.rank) params.set('rank', filters.rank);
  if (filters.coin !== TEASER_SEED_FILTERS.coin) params.set('coin', filters.coin);
  if (filters.minGames !== TEASER_SEED_FILTERS.minGames) params.set('min_games', String(filters.minGames));
  if (filters.period) params.set('period', filters.period);
  const query = params.toString();
  return query ? `?${query}` : '';
}

// The page of the other format mounts before the browser's address has changed, so the filters of a format switch also
// travel here for a moment (and stay in the link's address for a reload or a shared link).
let handoff: { filters: StandardMetaFilterQuery; at: number } | null = null;
const HANDOFF_MS = 5_000;

export function handOffMetaFilters(filters: StandardMetaFilterQuery): void {
  handoff = { filters, at: Date.now() };
}

/** The filters handed off by the format link just pressed, else those of the address. The hand-off is read once: Back must open the address's filters. */
export function carriedMetaFilters(search: string): StandardMetaFilterQuery {
  const handed = handoff;
  handoff = null;
  return handed && Date.now() - handed.at < HANDOFF_MS ? handed.filters : readMetaFilterQuery(search);
}
