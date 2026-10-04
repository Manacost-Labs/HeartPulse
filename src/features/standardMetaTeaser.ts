import type {
  StandardMetaData,
  StandardMetaFormat,
  StandardMetaMinGames,
  StandardMetaPeriod,
  StandardMetaServingRank,
} from '../../shared/standardMetaContract';

/**
 * The guest's first slice, read on the server from the anonymous teaser
 * (apps/public-web/lib/publicStandardMetaTeaser.ts): the period the page
 * opens with and its data.
 */
export type StandardMetaTeaserSeed = { period: StandardMetaPeriod; data: StandardMetaData };

/** The filters the meta page opens with; the server-rendered teaser is read for them. */
export const TEASER_SEED_FILTERS = { format: 'standard', rank: 'diamond_legend', minGames: 100 } as const;

/** Identity of one meta request; a resolved key means its data is on screen. */
export function metaRequestKey(format: StandardMetaFormat, rank: StandardMetaServingRank, period: StandardMetaPeriod | null,
  minGames: StandardMetaMinGames, revision: number, fullAccess: boolean): string {
  return `${format}:${rank}:${period ?? 'auto'}:${minGames}:${revision}:${fullAccess ? 'full' : 'teaser'}`;
}

/** The request a server-rendered teaser answers, or '' when the viewer needs full data. */
export function teaserSeedKey(seed: StandardMetaTeaserSeed | null, fullAccess: boolean): string {
  return seed && !fullAccess
    ? metaRequestKey(TEASER_SEED_FILTERS.format, TEASER_SEED_FILTERS.rank, seed.period, TEASER_SEED_FILTERS.minGames, 0, false)
    : '';
}
