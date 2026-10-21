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
  /** Fits a quarter of a phone-wide switch. */
  phoneLabel?: string;
  unit: 'percent' | 'count';
}> = [
  { id: 'deckPopularity', label: 'Использование в колодах', shortLabel: 'Использование', phoneLabel: 'Доля колод', unit: 'percent' },
  { id: 'deckWinrate', label: 'Победы колод с картой', shortLabel: 'Винрейт колод', unit: 'percent' },
  { id: 'timesPlayed', label: 'Сыграно партий', shortLabel: 'Партии', unit: 'count' },
  { id: 'winrateWhenPlayed', label: 'Винрейт при розыгрыше', shortLabel: 'При розыгрыше', phoneLabel: 'Розыгрыш', unit: 'percent' },
];

/** Average of comparable cards at one snapshot, served with the card history. */
export type ConstructedCardHistoryReferencePoint = {
  recordedAt: string;
  deckWinrate: number | null;
  winrateWhenPlayed: number | null;
};

export type ConstructedCardHistoryReference = {
  scope: 'class' | 'format';
  label: string;
  points: ConstructedCardHistoryReferencePoint[];
};

/** Metrics a reference average exists for: share and count of one card have no meaningful "average card". */
export const CONSTRUCTED_CARD_REFERENCE_METRICS: ReadonlySet<ConstructedCardHistoryMetric> = new Set(['deckWinrate', 'winrateWhenPlayed']);

/**
 * The statistics source publishes winrates only from 100 plays of a card in the period; below that
 * (for example before a card is released) its popularity is 0–3 stray plays, not a measurement.
 */
export const SAMPLED_TIMES_PLAYED = 100;
const DAY_MS = 24 * 60 * 60_000;
// Above this many calendar days one point per day reads better than every refresh of the source.
const SNAPSHOT_RESOLUTION_DAYS = 3;
// A day without a snapshot (an upstream outage) must not be drawn as a straight line across it.
const DAILY_GAP_MS = 1.5 * DAY_MS;
const Z95 = 1.959964;

export function isSampledSnapshot(point: ConstructedCardHistoryPoint): boolean {
  return point.deckWinrate !== null || (point.timesPlayed ?? 0) >= SAMPLED_TIMES_PLAYED;
}

/** Wilson 95% interval of a winrate (percent) from the number of games behind it. */
export function winrateInterval(ratePercent: number, games: number): [number, number] {
  const p = ratePercent / 100;
  const z2 = Z95 * Z95;
  const center = (p + z2 / (2 * games)) / (1 + z2 / games);
  const margin = (Z95 * Math.sqrt((p * (1 - p)) / games + z2 / (4 * games * games))) / (1 + z2 / games);
  return [(center - margin) * 100, (center + margin) * 100];
}

/** «21 окт» or «21 окт, 14:00». `timeZone` is fixed in tests; the page uses the reader's zone. */
export function formatHistoryMoment(timestamp: number, withTime: boolean, timeZone?: string): string {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone }).replace('.', '');
  if (!withTime) return day;
  return `${day}, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone })}`;
}

export type CardHistoryChartPoint = {
  x: number; y: number | null; label: string; tick: string; detail?: string;
  low?: number; high?: number; reference?: number | null;
};

type Observation = { timestamp: number; value: number };

export type CardHistoryView = {
  /** First snapshot of the card in the loaded slice, sampled or not. */
  trackedSince: number | null;
  /** First snapshot with a real sample; earlier ones are "no data yet". */
  sampledSince: number | null;
  resolution: 'snapshot' | 'day';
  points: CardHistoryChartPoint[];
  /** At least three real values: fewer are shown as a short note, not a line. */
  trend: boolean;
  latest: Observation | null;
  /** Latest minus the first real value of the range, once there is a trend. */
  change: number | null;
  minimum: Observation | null;
  maximum: Observation | null;
};

type ViewOptions = { timeZone?: string; reference?: ConstructedCardHistoryReferencePoint[] };

function lastPerDay(snapshots: ConstructedCardHistoryPoint[], timeZone?: string) {
  const days = new Map<string, ConstructedCardHistoryPoint>();
  for (const snapshot of snapshots) days.set(formatHistoryMoment(Date.parse(snapshot.recordedAt), false, timeZone), snapshot);
  return [...days.values()];
}

/**
 * Chart model of one metric. Snapshots before the card's first real sample are dropped instead of
 * drawn as zeros; later small samples stay, because a card leaving the meta is real information.
 */
export function cardHistoryView(
  points: ConstructedCardHistoryPoint[],
  metric: ConstructedCardHistoryMetric,
  { timeZone, reference = [] }: ViewOptions = {},
): CardHistoryView {
  const ordered = [...new Map(points
    .filter(point => Number.isFinite(Date.parse(point.recordedAt)))
    .map(point => [Date.parse(point.recordedAt), point] as const)).entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
  const firstSampled = ordered.findIndex(isSampledSnapshot);
  const sampled = firstSampled < 0 ? [] : ordered.slice(firstSampled);
  const valueOf = (point: ConstructedCardHistoryPoint) => {
    const value = point[metric];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const dayCount = new Set(sampled.map(point => formatHistoryMoment(Date.parse(point.recordedAt), false, timeZone))).size;
  const resolution = dayCount > SNAPSHOT_RESOLUTION_DAYS ? 'day' : 'snapshot';
  const plotted = resolution === 'day' ? lastPerDay(sampled, timeZone) : sampled;
  const referenceByTime = new Map(reference.map(item => [Date.parse(item.recordedAt), item]));
  const chartPoints: CardHistoryChartPoint[] = [];
  plotted.forEach((point, index) => {
    const timestamp = Date.parse(point.recordedAt);
    if (resolution === 'day' && index > 0 && timestamp - Date.parse(plotted[index - 1].recordedAt) > DAILY_GAP_MS) {
      const missing = Date.parse(plotted[index - 1].recordedAt) + DAY_MS;
      chartPoints.push({ x: missing, y: null, label: formatHistoryMoment(missing, false, timeZone), tick: formatHistoryMoment(missing, false, timeZone), reference: null });
    }
    const value = valueOf(point);
    const label = formatHistoryMoment(timestamp, resolution === 'snapshot', timeZone);
    const chartPoint: CardHistoryChartPoint = { x: timestamp, y: value, label, tick: label };
    const games = point.timesPlayed ?? 0;
    if (metric === 'winrateWhenPlayed' && value !== null && games > 0) {
      [chartPoint.low, chartPoint.high] = winrateInterval(value, games);
      chartPoint.detail = `${games.toLocaleString('ru-RU')} розыгрышей`;
    }
    const average = referenceByTime.get(timestamp);
    if (CONSTRUCTED_CARD_REFERENCE_METRICS.has(metric)) chartPoint.reference = average ? average[metric as 'deckWinrate'] : null;
    chartPoints.push(chartPoint);
  });
  const observed = chartPoints.flatMap(point => point.y === null ? [] : [{ timestamp: point.x, value: point.y }]);
  const extreme = (pick: (left: Observation, right: Observation) => boolean) => observed.reduce<Observation | null>(
    (best, item) => best === null || pick(item, best) ? item : best, null);
  const latest = observed.at(-1) ?? null;
  return {
    trackedSince: ordered.length ? Date.parse(ordered[0].recordedAt) : null,
    sampledSince: sampled.length ? Date.parse(sampled[0].recordedAt) : null,
    resolution,
    points: chartPoints,
    trend: observed.length >= 3,
    latest,
    change: observed.length >= 3 && latest ? latest.value - observed[0].value : null,
    minimum: extreme((item, best) => item.value < best.value),
    maximum: extreme((item, best) => item.value > best.value),
  };
}

export const CARD_HISTORY_RANGE_DAYS = [30, 90, 180] as const;

/**
 * Range buttons the history can fill: every range up to the first one that already shows the whole
 * history. A history shorter than the smallest range offers none — the page names its start instead.
 */
export function cardHistoryRanges(trackedSince: number | null, now: number) {
  if (trackedSince === null) return [];
  const spanDays = (now - trackedSince) / DAY_MS;
  if (spanDays < CARD_HISTORY_RANGE_DAYS[0]) return [];
  const covering = CARD_HISTORY_RANGE_DAYS.find(days => days >= spanDays) ?? CARD_HISTORY_RANGE_DAYS.at(-1)!;
  return CARD_HISTORY_RANGE_DAYS.map(days => ({ days, enabled: days <= covering }));
}
