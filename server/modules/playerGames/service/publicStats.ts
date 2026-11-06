import type { PlayerGameMode } from '../model/game.js';
import { publicPlayerStats } from '../model/publicStats.js';
import type { PlayerStats } from '../model/stats.js';
import type { PlayerStatsQuery, PlayerStatsService } from './playerStats.js';

const DAY_MS = 86_400_000;
const startOfUtcDay = (time: number): number => Math.floor(time / DAY_MS) * DAY_MS;

/**
 * The statistics as `/id/<n>/` shows them, for accounts whose owner made them
 * public. Built on the owner's service and its cache. Everything here stops
 * at the start of the current UTC day, the tabs included.
 */
export function createPublicStatsReader(service: PlayerStatsService) {
  return {
    /** Which tabs exist, as presence only: a count that grows with each game would let a visitor who polls time it. */
    modes(userId: string): Record<PlayerGameMode, number> {
      const modes = service.availableModes(userId, startOfUtcDay(service.now()));
      return { battlegrounds: Math.min(modes.battlegrounds, 1), standard: Math.min(modes.standard, 1),
        wild: Math.min(modes.wild, 1), arena: Math.min(modes.arena, 1) };
    },

    /**
     * Games up to the start of the current UTC day only, with period windows
     * ending there, so polling reveals neither a new game nor the moment an old
     * one leaves a window. No global comparison (it would depend on the
     * viewer) and fixed paid-comparison filters, so visitors cannot fill the
     * cache with variants. Projected by `publicPlayerStats`.
     */
    async load(userId: string, query: PlayerStatsQuery): Promise<PlayerStats> {
      const until = startOfUtcDay(service.now());
      const normalized: PlayerStatsQuery = { ...query, mmr: 'TOP_50_PERCENT', duos: query.mode === 'battlegrounds' && query.duos };
      return publicPlayerStats(await service.load(userId, normalized, false, until));
    },
  };
}
