import type { ChartPoint } from '../../../shared/ui/analytics/analyticsModel';

export type HeroAnalyticsRow = Record<string, unknown>;

/** Compositions with fewer games than this are dimmed: their average place is a rough estimate. */
export const HERO_LOW_SAMPLE_GAMES = 100;

export function heroAnalyticsNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[%\s]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

const rows = (value: unknown): HeroAnalyticsRow[] => (Array.isArray(value) ? value.filter(row => row && typeof row === 'object') : []);

/** Share of games on each of the eight places; a missing place stays out instead of reading as 0%. */
export function heroPlacementColumns(distribution: unknown) {
  return (Array.isArray(distribution) ? distribution : []).slice(0, 8).flatMap((value, index) => {
    const share = heroAnalyticsNumber(value);
    return share === null ? [] : [{ label: String(index + 1), value: share, accent: index < 4, detail: `${index + 1}-е место` }];
  });
}

/** A per-turn (or per-round) share as chart points ordered by turn; `detail` names the sample behind each point. */
export function heroTurnPoints(source: unknown, keys: { turn: string; value: string; sample: string }, name: string, sampleLabel: string): ChartPoint[] {
  return rows(source).flatMap(row => {
    const turn = heroAnalyticsNumber(row[keys.turn]);
    if (turn === null) return [];
    const sample = heroAnalyticsNumber(row[keys.sample]);
    return [{
      x: turn, y: heroAnalyticsNumber(row[keys.value]), label: `${name} ${turn}`, tick: String(turn),
      detail: sample === null ? undefined : `${sample.toLocaleString('ru-RU')} ${sampleLabel}`,
    }];
  }).sort((left, right) => Number(left.x) - Number(right.x));
}

export function heroTavernDistribution(source: unknown) {
  const turns = new Map<number, Record<string, number>>();
  rows(source).forEach(row => {
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

/**
 * The usual upgrade pace: the first turn on which each higher tavern tier
 * becomes the most common one, read from the per-turn most common tier.
 */
export function heroTavernPace(source: unknown) {
  const byTurn = rows(source).flatMap(row => {
    const turn = heroAnalyticsNumber(row.turn);
    const tier = heroAnalyticsNumber(row.recommended_tavern_tier);
    return turn === null || tier === null ? [] : [{ turn, tier, share: heroAnalyticsNumber(row.pct_at_tier) }];
  }).sort((left, right) => left.turn - right.turn);
  const pace: typeof byTurn = [];
  for (const row of byTurn) if (row.tier > (pace.at(-1)?.tier ?? 1)) pace.push(row);
  return pace;
}

/** Hero power use by turn and tavern tier for a turn × tier matrix; tiers run from the highest down. */
export function heroPowerMatrix(source: unknown) {
  const cells = new Map<string, { rate: number | null; games: number | null }>();
  const turns = new Map<number, number | null>();
  const tiers = new Set<number>();
  rows(source).forEach(row => {
    const turn = heroAnalyticsNumber(row.turn);
    const tier = heroAnalyticsNumber(row.tavern_tier);
    if (turn === null || tier === null) return;
    turns.set(turn, turns.get(turn) ?? heroAnalyticsNumber(row.gold));
    tiers.add(tier);
    cells.set(`${turn}:${tier}`, { rate: heroAnalyticsNumber(row.invoked_rate), games: heroAnalyticsNumber(row.total_data_points) });
  });
  return {
    turns: [...turns].sort(([a], [b]) => a - b).map(([turn, gold]) => ({ turn, gold })),
    tiers: [...tiers].sort((a, b) => b - a),
    cell: (turn: number, tier: number) => cells.get(`${turn}:${tier}`) ?? null,
  };
}

export type HeroCompositionRow = {
  key: string; name: string; share: number | null; placement: number | null; interval: number | null; games: number | null; lowSample: boolean;
};

/** Compositions by how often the hero plays them; the API orders them by average place, which puts tiny samples first. */
export function heroCompositionRows(source: unknown): HeroCompositionRow[] {
  return rows(source).map((row, index) => {
    const games = heroAnalyticsNumber(row.num_games);
    return {
      key: String(row.composition_id ?? `${String(row.name)}-${index}`),
      name: row.name === 'Aberrations' ? 'Аберрации' : String(row.name ?? 'Состав'),
      share: heroAnalyticsNumber(row.popularity_value ?? row.popularity),
      placement: heroAnalyticsNumber(row.avg_placement),
      interval: heroAnalyticsNumber(row.confidence_interval),
      games,
      lowSample: games !== null && games < HERO_LOW_SAMPLE_GAMES,
    };
  }).sort((left, right) => (right.games ?? -1) - (left.games ?? -1));
}

export type HeroFinalBoardMinion = { key: string; dbfId: string; name: string; share: number; golden: number | null };

/**
 * Key minions of the best composition's final board, grouped by the tavern tier
 * the game ended on. A group where every minion stands on 100% of boards is one
 * game rather than a pattern, so it is left out.
 */
export function heroFinalBoards(source: unknown, limit = 6) {
  const groups = new Map<number, HeroFinalBoardMinion[]>();
  rows(source).forEach((row, index) => {
    const tier = heroAnalyticsNumber(row.tavern_tier);
    const share = heroAnalyticsNumber(row.at_least_one);
    if (tier === null || share === null) return;
    const dbfId = String(row.dbfId ?? row.minion_dbf_id ?? '');
    const group = groups.get(tier) ?? [];
    group.push({ key: `${tier}-${dbfId}-${index}`, dbfId, name: String(row.name ?? 'Существо'), share, golden: heroAnalyticsNumber(row.at_least_one_premium) });
    groups.set(tier, group);
  });
  return [...groups]
    .filter(([, minions]) => minions.length > 1 && minions.some(minion => minion.share < 99.99))
    .sort(([a], [b]) => b - a)
    .map(([tier, minions]) => ({ tier, minions: minions.sort((left, right) => right.share - left.share).slice(0, limit) }));
}
