/** Pure models behind the archetype page's KPI strip, history charts, rank heatmap, build comparison and radar. */

import type { ChartPoint } from '../shared/ui/analytics/analyticsModel';
import { standardMetaPeriodLabel } from './standardMetaFilterModel';
import type { StandardMetaPeriod } from '../../shared/standardMetaContract';

type HistoryPoint = { recordedAt: string; winrate: number | null; popularity: number | null; games: number; patch?: string | null };

const Z_95 = 1.959964;
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

const HOUR_MS = 60 * 60 * 1000;
const MIN_DAILY_WINDOW_HOURS = 6;
const COUNT = (value: number) => Math.round(value).toLocaleString('ru-RU');

/**
 * Games gained over the last 24 hours, per slice. HSGuru counts games cumulatively inside a
 * period (the `patch` of a slice) and restarts at the next one, so the raw count is a saw.
 * The base is the newest slice of the same period at least a day older, or the period's
 * first slice while it is younger than a day; the gain is scaled to 24 hours. A slice
 * without such a base, a window under six hours or a shrinking count stays empty.
 */
export function dailyGames(points: readonly { recordedAt: string; games: number; patch?: string | null }[]) {
  return points.map((point, index) => {
    const time = Date.parse(point.recordedAt);
    const earlier = points.slice(0, index).filter(other => (other.patch ?? null) === (point.patch ?? null) && Date.parse(other.recordedAt) < time);
    const base = earlier.filter(other => Date.parse(other.recordedAt) <= time - DAY_MS).at(-1) ?? earlier[0];
    const hours = base ? (time - Date.parse(base.recordedAt)) / HOUR_MS : null;
    if (!base || hours === null || hours < MIN_DAILY_WINDOW_HOURS || point.games < base.games) return { games: null, hours };
    return { games: Math.round((point.games - base.games) * 24 / hours), hours };
  });
}

/** Readable name of an HSGuru history period: «Патч 36.6.3», «Тёмная империя». */
export function historyPeriodLabel(period: string) {
  return standardMetaPeriodLabel(period as StandardMetaPeriod);
}

/**
 * Points of the three history charts. Each point names its HSGuru period, so a chart breaks
 * the line where the period changes instead of joining values of different windows; the
 * winrate carries its 95% Wilson band from the slice's games.
 */
export function archetypeHistoryCharts(points: readonly HistoryPoint[], timeZone?: string) {
  const full = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone });
  const short = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone });
  const daily = dailyGames(points);
  const base = points.map(point => {
    const date = new Date(point.recordedAt);
    return { x: date.getTime(), label: full.format(date), tick: short.format(date).replace('.', ''), segment: point.patch ?? undefined };
  });
  const sample = (point: HistoryPoint) => `${COUNT(point.games)} игр за период`;
  return {
    winrate: points.map((point, index): ChartPoint => {
      const [low, high] = point.winrate === null ? [null, null] : wilsonInterval(point.winrate, point.games);
      return { ...base[index], y: point.winrate, low, high, detail: sample(point) };
    }),
    popularity: points.map((point, index): ChartPoint => ({ ...base[index], y: point.popularity, detail: sample(point) })),
    dailyGames: points.map((point, index): ChartPoint => {
      const { games, hours } = daily[index];
      const window = hours === null || Math.abs(hours - 24) < 1 ? 'за 24 часа' : `за ${COUNT(hours)} ч, пересчёт на сутки`;
      return { ...base[index], y: games, detail: games === null ? 'Нет суток для сравнения в периоде' : window };
    }),
  };
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

export type RankMatrix = {
  ranks: { id: string; label: string }[];
  periods: { id: string; label: string }[];
  cells: { rank: string; period: string; winrate: number | null; games: number | null }[];
  /** The ranks in the Bans window by coin (`cells[].period` is the coin); absent from older answers. */
  coins?: { period: string; columns: { id: string; label: string }[]; cells: RankMatrix['cells'] };
  updatedAt: string | null;
};
