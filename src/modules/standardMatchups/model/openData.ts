import type { PublicStandardMatchups } from './publicProjection';
import type { StandardMatchupsData } from './types';

/**
 * The open general slice in the shape of the subscriber's matrix, so the guest's page is the same component
 * on the same model. Only what the open projection holds is copied: no ranks, periods or history can appear.
 */
export function openStandardMatchupsData(open: PublicStandardMatchups): StandardMatchupsData {
  const { archetypes, pairs } = open;
  return {
    format: open.format, formatLabel: open.formatLabel, rank: 'all', rankLabel: open.rankLabel, period: open.period,
    minGames: open.minGames, totalGames: open.totalGames, source: 'hsguru', sourceUrl: open.sourceUrl,
    updatedAt: open.updatedAt, ...(open.warning ? { warning: open.warning } : {}),
    columns: archetypes.map(item => ({
      name: item.name, label: item.label, classKey: item.classKey, popularity: item.popularity, games: item.games,
    })),
    rows: archetypes.map((item, row) => ({
      archetype: item.name, archetypeLabel: item.label, classKey: item.classKey, winrate: item.winrate, games: item.games,
      cells: archetypes.map((opponent, column) => {
        const pair = pairs[row][column];
        return { opponent: opponent.name, opponentLabel: opponent.label, winrate: pair?.winrate ?? null, ...(pair ? { games: pair.games } : {}) };
      }),
    })),
  };
}
