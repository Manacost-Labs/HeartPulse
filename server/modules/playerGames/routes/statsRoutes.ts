import { Router, type Request, type Response } from 'express';
import { PLAYER_GAME_MODES, type PlayerGameMode } from '../model/game.js';
import { GLOBAL_MMR_FILTERS, STATS_PERIODS, type GlobalMmrFilter, type StatsPeriod } from '../model/stats.js';
import type { PlayerStatsService } from '../service/playerStats.js';
import { createPublicStatsReader } from '../service/publicStats.js';

/** The paid site section whose subscription unlocks a mode's global comparison. */
export type GlobalStatsEntitlement = 'battlegrounds' | 'standard' | 'arena';

export type PlayerStatsRouterDependencies = {
  userAuth: (request: Request) => { id: string } | null;
  hasEntitlement: (request: Request, entitlement: GlobalStatsEntitlement) => Promise<boolean>;
  service: PlayerStatsService;
  setPrivateNoStore: (response: Response) => void;
  /**
   * The account behind a public profile ID while its owner shows the
   * statistics; null for hidden, blocked and missing profiles alike. Without
   * it the public statistics routes are not mounted.
   */
  resolvePublicStatsOwner?: (publicProfileId: string) => string | null;
};

// Like the public profile itself: the answer has no viewer data, and a
// switched-off profile disappears within a minute.
const PUBLIC_STATS_CACHE_CONTROL = 'public, max-age=60';
const PUBLIC_NOT_FOUND = { error: 'Статистика не найдена' };

const ENTITLEMENT: Record<PlayerGameMode, GlobalStatsEntitlement> = {
  battlegrounds: 'battlegrounds',
  standard: 'standard',
  wild: 'standard',
  arena: 'arena',
};

type StatsFilters = { mode: PlayerGameMode; period: StatsPeriod; mmr: GlobalMmrFilter; duos: boolean };

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T | null): T | null {
  if (value === undefined) return fallback;
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}

function statsFilters(request: Request): StatsFilters | null {
  const mode = oneOf<PlayerGameMode>(request.query.mode, PLAYER_GAME_MODES, null);
  const period = oneOf<StatsPeriod>(request.query.period, STATS_PERIODS, 'all');
  const mmr = oneOf<GlobalMmrFilter>(request.query.mmr, GLOBAL_MMR_FILTERS, 'TOP_50_PERCENT');
  const duos = oneOf(request.query.duos, ['0', '1'], '0');
  return mode && period && mmr && duos ? { mode, period, mmr, duos: duos === '1' } : null;
}

/**
 * `GET /account/game-stats`: the signed-in account's own statistics for the
 * account page. Cookie session only; global comparisons follow the paywall
 * of the section they come from. `GET /profiles/:id/game-stats` is the same
 * data of an account that shows it publicly, in its public projection.
 */
export function createPlayerStatsRouter(dependencies: PlayerStatsRouterDependencies): Router {
  const router = Router();
  // Lets the account page decide whether to show the section at all: no version 2 events, no section.
  router.get('/account/game-stats/modes', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    try {
      return response.json({ modes: dependencies.service.availableModes(user.id) });
    } catch {
      return response.status(503).json({ error: 'Не удалось загрузить статистику' });
    }
  });
  router.get('/account/game-stats', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    const filters = statsFilters(request);
    if (!filters) return response.status(400).json({ error: 'Неверные параметры статистики' });
    try {
      const globalAllowed = await dependencies.hasEntitlement(request, ENTITLEMENT[filters.mode]).catch(() => false);
      return response.json(await dependencies.service.load(user.id, filters, globalAllowed));
    } catch {
      return response.status(503).json({ error: 'Не удалось загрузить статистику' });
    }
  });

  const resolveOwner = dependencies.resolvePublicStatsOwner;
  if (resolveOwner) {
    const publicStats = createPublicStatsReader(dependencies.service);
    router.get('/profiles/:publicProfileId/game-stats/modes', (request, response) => {
      response.set('Cache-Control', PUBLIC_STATS_CACHE_CONTROL);
      try {
        const owner = resolveOwner(request.params.publicProfileId);
        if (!owner) return response.status(404).json(PUBLIC_NOT_FOUND);
        return response.json({ modes: publicStats.modes(owner) });
      } catch {
        response.set('Cache-Control', 'no-store');
        return response.status(503).json({ error: 'Не удалось загрузить статистику' });
      }
    });
    router.get('/profiles/:publicProfileId/game-stats', async (request, response) => {
      response.set('Cache-Control', PUBLIC_STATS_CACHE_CONTROL);
      try {
        const owner = resolveOwner(request.params.publicProfileId);
        if (!owner) return response.status(404).json(PUBLIC_NOT_FOUND);
        const filters = statsFilters(request);
        if (!filters) return response.status(400).json({ error: 'Неверные параметры статистики' });
        return response.json(await publicStats.load(owner, filters));
      } catch {
        response.set('Cache-Control', 'no-store');
        return response.status(503).json({ error: 'Не удалось загрузить статистику' });
      }
    });
  }
  return router;
}
