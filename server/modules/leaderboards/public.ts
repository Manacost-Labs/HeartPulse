import { createLeaderboardsRouter } from './routes.js';
import { createLeaderboardsService } from './service.js';

export { createLeaderboardsRouter, type LeaderboardsRouterDependencies } from './routes.js';
export { createLeaderboardsService, LEADERBOARD_PAGE_SIZE, type LeaderboardsService } from './service.js';

/** `/api/leaderboards/*` поверх официальных таблиц лидеров Blizzard в hs-data-api (docs/specs/official-leaderboards.md). */
export function createLeaderboardsApi({ baseUrl }: { baseUrl: string }) {
  return createLeaderboardsRouter({
    service: createLeaderboardsService({ baseUrl }),
    onError: error => console.error('[leaderboards] read failed:', error instanceof Error ? error.message : error),
  });
}
