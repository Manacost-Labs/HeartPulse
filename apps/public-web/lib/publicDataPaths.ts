import { leaderboardApiQuery, type LeaderboardSelection } from '@/src/modules/leaderboards/public';

/**
 * Express paths the data pages read for their first paint. The loaders of the
 * pages and the probe of `proxy.ts` build them here, so both ask for the same
 * key of the last good store and the page finds what the proxy has warmed.
 */
export const leaderboardPaths = (selection: LeaderboardSelection) => ({
  catalog: '/api/leaderboards/seasons',
  table: `/api/leaderboards/table?${leaderboardApiQuery(selection, true)}`,
  stats: `/api/leaderboards/stats?${leaderboardApiQuery(selection, false)}`,
});

export const archetypeTeaserPath = (format: string, period: string | null) =>
  `/api/constructed-archetypes/teaser?format=${format}${period ? `&period=${period}` : ''}`;

export const STREAMERS_PATH = '/api/streamers';
export const streamerPath = (slug: string) => `/api/streamers/${encodeURIComponent(slug)}`;
export const FUN_DECKS_PATH = '/api/fun-decks';
export const HOME_PATHS = { summary: '/api/home/summary', articles: '/api/articles' } as const;
