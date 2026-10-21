/** Pure models behind the archetype page's KPI strip, history band, rank heatmap, build comparison and radar. */

type HistoryPoint = { recordedAt: string; winrate: number | null; popularity: number | null; games: number; patch?: string | null };

const Z_95 = 1.959964;
const Z_50 = 0.674490;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Wilson score interval of a winrate, in percent. Unlike the normal approximation it stays
 * inside 0–100 and widens honestly for a small number of games.
 */
export function wilsonInterval(winratePercent: number, games: number, z = Z_95): [number, number] {
  if (!(games > 0) || !Number.isFinite(winratePercent)) return [0, 100];
  const p = Math.min(1, Math.max(0, winratePercent / 100));
  const z2 = z * z;
  const denominator = 1 + z2 / games;
  const centre = (p + z2 / (2 * games)) / denominator;
  const margin = (z * Math.sqrt(p * (1 - p) / games + z2 / (4 * games * games))) / denominator;
  return [Math.max(0, centre - margin) * 100, Math.min(1, centre + margin) * 100];
}

// Short "24.07" labels: a season of 12-hour slices still leaves readable axis ticks on a phone.
const DATE_LABEL = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

export type WinrateBandPoint = {
  label: string;
  actual?: number;
  low?: number;
  high?: number;
  innerLow?: number;
  innerHigh?: number;
};

/** Each history slice with its 95% and 50% Wilson intervals; slices accumulate games, so the band narrows over a period. */
export function winrateBand(points: readonly HistoryPoint[]): WinrateBandPoint[] {
  return points.flatMap(point => {
    if (point.winrate === null || !Number.isFinite(point.winrate)) return [];
    const [low, high] = wilsonInterval(point.winrate, point.games, Z_95);
    const [innerLow, innerHigh] = wilsonInterval(point.winrate, point.games, Z_50);
    return [{ label: DATE_LABEL.format(new Date(point.recordedAt)), actual: point.winrate, low, high, innerLow, innerHigh }];
  });
}

export type KpiComparison<P extends HistoryPoint> = {
  latest: P;
  previous: P;
  trend: P[];
  /** Games accumulate per period: their change and sparkline only exist within the latest period. */
  gamesPrevious: P | null;
  gamesTrend: P[];
};

/**
 * The strip compares the newest slice with the newest one at least a day older (slices
 * arrive every 12 hours) and draws the last 7 days. Rates compare across a period change;
 * game counts restart with a new period, so they compare only within the latest one.
 * Null until two such slices exist.
 */
export function historyKpiComparison<P extends HistoryPoint>(points: readonly P[]): KpiComparison<P> | null {
  const latest = points.at(-1);
  if (!latest) return null;
  const latestAt = Date.parse(latest.recordedAt);
  const previous = points.filter(point => Date.parse(point.recordedAt) <= latestAt - DAY_MS).at(-1);
  if (!previous) return null;
  const trend = points.filter(point => Date.parse(point.recordedAt) >= latestAt - 7 * DAY_MS);
  const samePeriod = (point: P) => (point.patch ?? null) === (latest.patch ?? null);
  return {
    latest,
    previous,
    trend,
    gamesPrevious: samePeriod(previous) ? previous : null,
    gamesTrend: trend.filter(samePeriod),
  };
}

export const MANA_CURVE_LABELS = ['0–1', '2', '3', '4', '5', '6', '7+'];

/** Card counts per cost bucket; cards with an unknown cost are left out. */
export function deckManaCurve(cards: readonly { cost: number | null; count: number }[]): number[] {
  const curve = Array.from({ length: MANA_CURVE_LABELS.length }, () => 0);
  for (const card of cards) {
    if (card.cost === null || !Number.isFinite(card.cost)) continue;
    curve[Math.min(6, Math.max(0, card.cost - 1))] += card.count;
  }
  return curve;
}

type RadarItem = {
  slug: string;
  winrate: number | null;
  popularity: number | null;
  durationMinutes: number | null;
  turns: number | null;
  climbingSpeed: number | null;
};

export const RADAR_AXES = [
  { key: 'winrate', label: 'Винрейт' },
  { key: 'popularity', label: 'Популярность' },
  { key: 'durationMinutes', label: 'Длина матча' },
  { key: 'turns', label: 'Средний ход' },
  { key: 'climbingSpeed', label: 'Подъём по ладдеру' },
] as const;

/**
 * The axes have different units, so each is the archetype's percentile among the format's
 * archetypes (0 = lowest, 100 = highest); a missing value leaves the axis empty.
 */
export function archetypeRadarProfile(item: RadarItem, items: readonly RadarItem[]) {
  return RADAR_AXES.map(axis => {
    const value = item[axis.key];
    const values = items.map(other => other[axis.key]).filter((entry): entry is number => entry !== null && Number.isFinite(entry));
    if (value === null || !Number.isFinite(value) || values.length < 2) return { ...axis, value, score: null };
    const below = values.filter(entry => entry < value).length;
    return { ...axis, value, score: Math.round((below / (values.length - 1)) * 100) };
  });
}

type RankMatrix = {
  ranks: { id: string; label: string }[];
  periods: { id: string; label: string }[];
  cells: { rank: string; period: string; winrate: number | null; games: number | null }[];
  updatedAt: string | null;
};

/** Ranks as rows and periods as columns; a slice without the archetype stays NaN (an empty cell). */
export function rankHeatmapGrid(matrix: RankMatrix) {
  const byKey = new Map(matrix.cells.map(cell => [`${cell.rank}|${cell.period}`, cell]));
  let filled = 0;
  const values = matrix.ranks.map(rank => matrix.periods.map(period => {
    const winrate = byKey.get(`${rank.id}|${period.id}`)?.winrate;
    if (winrate === null || winrate === undefined || !Number.isFinite(winrate)) return Number.NaN;
    filled += 1;
    return winrate;
  }));
  return {
    rows: matrix.ranks.map(rank => rank.label),
    columns: matrix.periods.map(period => period.label),
    values,
    filled,
    games: matrix.ranks.map(rank => matrix.periods.map(period => byKey.get(`${rank.id}|${period.id}`)?.games ?? null)),
  };
}
