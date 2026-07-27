export type ConstructedCardHistoryPoint = {
  recordedAt: string;
  deckPopularity: number | null;
  deckWinrate: number | null;
  averageCopies: number | null;
  timesPlayed: number | null;
  winrateWhenPlayed: number | null;
  winrateWhenDrawn: number | null;
  keepPercentage: number | null;
  openingHandWinrate: number | null;
  averageTurnsInHand: number | null;
  averageTurnPlayed: number | null;
};

export type ConstructedCardHistoryMetric =
  | 'deckPopularity'
  | 'deckWinrate'
  | 'timesPlayed'
  | 'winrateWhenPlayed';

export const CONSTRUCTED_CARD_HISTORY_METRICS: ReadonlyArray<{
  id: ConstructedCardHistoryMetric;
  label: string;
  shortLabel: string;
  unit: 'percent' | 'count';
}> = [
  { id: 'deckPopularity', label: 'Использование в колодах', shortLabel: 'Использование', unit: 'percent' },
  { id: 'deckWinrate', label: 'Победы колод с картой', shortLabel: 'Винрейт колод', unit: 'percent' },
  { id: 'timesPlayed', label: 'Сыграно партий', shortLabel: 'Партии', unit: 'count' },
  { id: 'winrateWhenPlayed', label: 'Винрейт при розыгрыше', shortLabel: 'При розыгрыше', unit: 'percent' },
];

export type ConstructedCardHistorySeriesPoint = {
  recordedAt: string;
  timestamp: number;
  value: number;
};

export function constructedCardHistorySeries(
  points: ConstructedCardHistoryPoint[],
  metric: ConstructedCardHistoryMetric,
): ConstructedCardHistorySeriesPoint[] {
  const byTimestamp = new Map<number, ConstructedCardHistorySeriesPoint>();
  for (const point of points) {
    const timestamp = Date.parse(point.recordedAt);
    const value = point[metric];
    if (!Number.isFinite(timestamp) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    byTimestamp.set(timestamp, { recordedAt: new Date(timestamp).toISOString(), timestamp, value });
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
}

export function constructedCardHistoryDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.05, 1);
    return [Math.max(0, minimum - padding), maximum + padding];
  }
  const padding = Math.max((maximum - minimum) * 0.12, 0.1);
  return [Math.max(0, minimum - padding), maximum + padding];
}

export function constructedCardHistoryDelta(series: ConstructedCardHistorySeriesPoint[]): number | null {
  if (series.length < 2) return null;
  return series.at(-1)!.value - series[0].value;
}
