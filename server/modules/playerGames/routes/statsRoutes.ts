import { Router, type Request, type Response } from 'express';
import { PLAYER_GAME_MODES, type PlayerGameMode } from '../model/game.js';
import { GLOBAL_MMR_FILTERS, STATS_PERIODS, type GlobalMmrFilter, type StatsPeriod } from '../model/stats.js';
import type { PlayerStatsService } from '../service/playerStats.js';

/** The paid site section whose subscription unlocks a mode's global comparison. */
export type GlobalStatsEntitlement = 'battlegrounds' | 'standard' | 'arena';

export type PlayerStatsRouterDependencies = {
  userAuth: (request: Request) => { id: string } | null;
  hasEntitlement: (request: Request, entitlement: GlobalStatsEntitlement) => Promise<boolean>;
  service: PlayerStatsService;
  setPrivateNoStore: (response: Response) => void;
};

const ENTITLEMENT: Record<PlayerGameMode, GlobalStatsEntitlement> = {
  battlegrounds: 'battlegrounds',
  standard: 'standard',
  wild: 'standard',
  arena: 'arena',
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T | null): T | null {
  if (value === undefined) return fallback;
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}

/**
 * `GET /account/game-stats`: the signed-in account's own statistics for the
 * account page. Cookie session only; global comparisons follow the paywall
 * of the section they come from.
 */
export function createPlayerStatsRouter(dependencies: PlayerStatsRouterDependencies): Router {
  const router = Router();
  router.get('/account/game-stats', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    const mode = oneOf<PlayerGameMode>(request.query.mode, PLAYER_GAME_MODES, null);
    const period = oneOf<StatsPeriod>(request.query.period, STATS_PERIODS, 'all');
    const mmr = oneOf<GlobalMmrFilter>(request.query.mmr, GLOBAL_MMR_FILTERS, 'TOP_50_PERCENT');
    const duos = oneOf(request.query.duos, ['0', '1'], '0');
    if (!mode || !period || !mmr || !duos) return response.status(400).json({ error: 'Неверные параметры статистики' });
    try {
      const globalAllowed = await dependencies.hasEntitlement(request, ENTITLEMENT[mode]).catch(() => false);
      const stats = await dependencies.service.load(user.id, { mode, period, mmr, duos: duos === '1' }, globalAllowed);
      return response.json(stats);
    } catch {
      return response.status(503).json({ error: 'Не удалось загрузить статистику' });
    }
  });
  return router;
}
