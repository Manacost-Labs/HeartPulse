export type HeroAnalyticsRow = Record<string, unknown>;

export function heroAnalyticsNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[%\s]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function heroTavernDistribution(rows: HeroAnalyticsRow[]) {
  const turns = new Map<number, Record<string, number>>();
  rows.forEach(row => {
    const turn = heroAnalyticsNumber(row.turn);
    const tier = heroAnalyticsNumber(row.tavern_tier);
    const value = heroAnalyticsNumber(row.pct_at_tier);
    if (turn === null || tier === null || value === null) return;
    const values = turns.get(turn) ?? {};
    values[String(tier)] = value;
    turns.set(turn, values);
  });
  return [...turns].sort(([a], [b]) => a - b).map(([turn, values]) => ({ label: `Ход ${turn}`, values }));
}
