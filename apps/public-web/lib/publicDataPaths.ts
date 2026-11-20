import { isStandardMetaPeriod } from '@/shared/standardMetaPeriods';

/**
 * Express paths the data pages read for their first paint. The loaders of
 * the pages and the probe of `proxy.ts` build them here, so both ask for the
 * same key of the last good store and the page finds what the proxy warmed.
 * The leaderboards need their module and are in `publicLeaderboardPaths.ts`:
 * importing it here would pull its UI into every page that reads a path.
 */
export const archetypeTeaserPath = (format: string, period: string | null) =>
  `/api/constructed-archetypes/teaser?format=${format}${period ? `&period=${period}` : ''}`;

/**
 * The catalog window of an archetype page: the detail names it in `patch` (`black_empire_ban`, or `37.0.2` for a
 * patch), and the page reads its plates and neighbours from that window.
 */
export const archetypeCatalogPeriod = (patch: string) => (!patch ? null : isStandardMetaPeriod(patch) ? patch : `patch_${patch}`);

export const STREAMERS_PATH = '/api/streamers';
export const streamerPath = (slug: string) => `/api/streamers/${encodeURIComponent(slug)}`;
export const FUN_DECKS_PATH = '/api/fun-decks';
export const HOME_PATHS = { summary: '/api/home/summary', articles: '/api/articles' } as const;
