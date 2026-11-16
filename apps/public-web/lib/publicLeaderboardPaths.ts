import { leaderboardApiQuery, type LeaderboardSelection } from '@/src/modules/leaderboards/public';

/** The three Express paths of the leaderboards page; shared by its loader and the `proxy.ts` probe. */
export const leaderboardPaths = (selection: LeaderboardSelection) => ({
  catalog: '/api/leaderboards/seasons',
  table: `/api/leaderboards/table?${leaderboardApiQuery(selection, true)}`,
  stats: `/api/leaderboards/stats?${leaderboardApiQuery(selection, false)}`,
});
