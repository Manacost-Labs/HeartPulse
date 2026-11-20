/**
 * The open matchup slice as Express answers it (`GET /api/standard/matchups/public`), for the
 * Next page tests. The open answer may carry noise a projection must never let through: the
 * page's own re-check drops it. The protected answer carries sentinels in every paid field.
 */
export const SENTINELS = ['63.3636', '63.4', 'SENTINEL_HISTORY', 'SENTINEL_RANK', 'SENTINEL_PERIOD'];

const NAMES = Array.from({ length: 36 }, (_, index) => `Open Archetype ${index + 1}`);

export function openAnswer({ noise = false, warning, format = 'standard' }: { noise?: boolean; warning?: string; format?: string } = {}) {
  return {
    format, formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт', rank: 'all', rankLabel: 'Все ранги', period: 'bans', minGames: 25,
    totalGames: 120_000, source: 'hsguru', sourceUrl: 'https://www.hsguru.com/matchups?format=2&rank=all',
    updatedAt: '2026-11-18T09:30:00.000Z', ...(warning ? { warning } : {}),
    columns: NAMES.map((name, index) => ({ name, label: `Открытый архетип ${index + 1}`, classKey: index % 2 ? 'mage' : 'priest',
      popularity: `${(20 - index / 2).toFixed(1)}%`, games: 9000 - index * 100 })),
    rows: NAMES.map((name, index) => ({
      archetype: name, archetypeLabel: `Открытый архетип ${index + 1}`, classKey: index % 2 ? 'mage' : 'priest',
      winrate: 55 - index / 4, games: 9000 - index * 100,
      cells: NAMES.map((opponent, column) => ({ opponent, winrate: opponent === name ? 50 : 41.5 + ((index * 7 + column * 3) % 17), games: 300 })),
      ...(noise ? { history: 'SENTINEL_HISTORY', legend: { winrate: 63.3636 } } : {}),
    })),
    ...(noise ? { available: { ranks: ['SENTINEL_RANK'], periods: ['SENTINEL_PERIOD'] }, history: 'SENTINEL_HISTORY' } : {}),
  };
}

export function protectedAnswer({ format = 'standard' }: { format?: string } = {}) {
  const open = openAnswer({ format });
  return { ...open, rank: 'legend', rankLabel: 'Легенда', period: 'SENTINEL_PERIOD', available: {
    ranks: ['all', 'legend', 'SENTINEL_RANK'], periods: ['bans', 'SENTINEL_PERIOD'], currentPeriod: 'bans', defaultPeriod: 'bans',
    minGames: [25] },
  rows: open.rows.map((row, index) => ({ ...row, winrate: index === 0 ? 63.3636 : row.winrate })) };
}
