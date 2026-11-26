import { publicPlayerStats } from '../model/publicStats.js';
import type { AvailableModes, PlayerStats } from '../model/stats.js';
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
    /**
     * Which tabs and Battlegrounds queues exist, as presence only: a count that
     * grows with each game would let a visitor who polls time it.
     */
    modes(userId: string): AvailableModes {
      const { modes, battlegroundsQueues: queues } = service.availableModes(userId, startOfUtcDay(service.now()));
      const seen = (count: number) => Math.min(count, 1);
      return {
        modes: { battlegrounds: seen(modes.battlegrounds), standard: seen(modes.standard), wild: seen(modes.wild), arena: seen(modes.arena) },
        battlegroundsQueues: { solo: seen(queues.solo), duos: seen(queues.duos) },
      };
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
