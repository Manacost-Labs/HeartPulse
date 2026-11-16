// A class winrate dataset (the shape `GET /api/winrates` serves) whose every
// closed figure is unique, so a test can look for it in any output: winrates
// with more digits than the open 0.1, wins, pick rates, and breakdowns by
// card, period and history that the dataset does not have today but a source
// may add. The exact game count of a class is open (the owner's decision), so
// it is not in the closed list.

export const CLASS_IDS = ['death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman',
  'warlock', 'warrior'] as const;
export const UPDATED_AT = '2026-11-15T17:00:03.639Z';

type Row = Record<string, unknown>;

// Stored out of order on purpose: the order of the open table comes from the winrate.
const STORED_ORDER = [4, 9, 0, 7, 2, 10, 5, 1, 8, 3, 6];

function exactWinrate(rank: number): number {
  // rank 0 is the best class; every value has five digits after the point.
  return Number((57.34821 - rank * 1.61237).toFixed(5));
}

export function buildClassesFixture(): { classes: Row[]; updatedAt: string; source: string; dataPoints: number; timePeriod: string } {
  const classes = STORED_ORDER.map(rank => {
    const id = CLASS_IDS[rank];
    return {
      id, name: `Класс ${id}`, color: '#123456',
      winrate: exactWinrate(rank),
      games: 120_000 + rank * 1_337 + 11,
      wins: 4_318_209 + rank * 7_919 + 3,
      losses: 3_974_105 + rank * 6_131 + 5,
      pickRate: Number((9.01 + rank * 0.07309 + 0.00041).toFixed(5)),
      sevenPlusWinsRate: Number((11.5 + rank * 0.0517 + 0.00067).toFixed(5)),
      heroPowerCardId: `HP_SENTINEL_${id}`,
      winsDistribution: [{ wins: 3, games: 900_001 + rank }, { wins: 12, games: 800_003 + rank }],
      matchups: [{ opponentClassId: 'mage', games: 700_001 + rank, wins: 300_007 + rank, losses: 400_009 + rank, winrate: Number((48.7 + rank * 0.01234 + 0.00019).toFixed(5)) }],
      byPeriod: [{ period: `sentinel-period-${id}`, winrate: Number((50.1 + rank * 0.0331 + 0.00023).toFixed(5)) }],
      byCard: [{ cardId: `SENTINEL_CARD_${id}`, winrate: Number((52.2 + rank * 0.0443 + 0.00029).toFixed(5)) }],
      history: [{ date: `2026-09-${10 + rank}`, winrate: Number((49.9 + rank * 0.0553 + 0.00031).toFixed(5)), games: 600_001 + rank }],
    };
  });
  return { classes, updatedAt: UPDATED_AT, source: 'api.kolodahearthstone.com', dataPoints: 8_765_431, timePeriod: 'sentinel-last-patch' };
}

/** What the open table says, best class first: the rounded winrate and the sample size. */
export const OPEN_ROWS = CLASS_IDS.map((id, rank) => ({
  place: rank + 1, id, name: `Класс ${id}`, winrate: Math.round(exactWinrate(rank) * 10) / 10, sample: 120_000 + rank * 1_337 + 11,
}));

/** The figures and words that must never reach a guest's page. */
export function closedValues(): string[] {
  const values = ['8765431', '8 765 431', 'sentinel-last-patch'];
  for (const row of buildClassesFixture().classes) {
    for (const key of ['winrate', 'wins', 'losses', 'pickRate', 'sevenPlusWinsRate']) {
      values.push(String(row[key]), Number(row[key]).toLocaleString('ru-RU'));
    }
    values.push(String(row.heroPowerCardId));
    JSON.stringify([row.winsDistribution, row.matchups, row.byPeriod, row.byCard, row.history])
      .match(/[\w-]*(?:sentinel|SENTINEL|HP_)[\w-]*|\d+\.\d{3,}|\d{6,}/g)?.forEach(value => values.push(value));
  }
  return [...new Set(values)].filter(value => value !== 'NaN');
}
