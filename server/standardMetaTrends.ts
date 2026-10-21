import {
  STANDARD_META_ROLLING_PERIODS,
  type StandardMetaPeriod,
  type StandardMetaRollingPeriod,
} from '../shared/standardMetaPeriods.js';
import type { StandardMetaTrendItem, StandardMetaTrends } from '../shared/standardMetaTrendsContract.js';

type SliceRow = { id: string; games: number | null; winrate: number | null; popularity: number | null };
/** One HSGuru meta slice as the meta route serves it; only the fields trends read. */
export type MetaTrendSlice = { period: StandardMetaPeriod; updatedAt: string | null; items: readonly SliceRow[] };
type Window = { rows: Map<string, SliceRow>; total: number | null };
type Sample = { winrate: number | null; popularity: number | null; games: number };

// Disjoint windows cut from the nested rolling ones, newest first: the
// shortest window itself, then each window minus the one inside it.
const BUCKET_LABELS = ['0–3 ч', '3–6 ч', '6–24 ч', '1–3 дн.', '3–7 дн.', '7–14 дн.', '14–30 дн.'];
const COMPARISONS: Record<Exclude<StandardMetaRollingPeriod, 'past_30_days'>, { label: string; description: string }> = {
  past_3_hours: { label: 'к пред. 3 ч', description: 'окно 3–6 часов назад' },
  past_6_hours: { label: 'к пред. 18 ч', description: 'окно 6–24 часа назад' },
  past_day: { label: 'к пред. 2 дням', description: 'окно 1–3 дня назад' },
  past_3_days: { label: 'к пред. 4 дням', description: 'окно 3–7 дней назад' },
  past_week: { label: 'к пред. неделе', description: 'окно 7–14 дней назад' },
  past_2_weeks: { label: 'к пред. 16 дням', description: 'окно 14–30 дней назад' },
};
const BEFORE_PERIOD = { label: 'к дням до периода', description: 'дни из последних 30 до начала периода' };
// The source rounds win rates to 0.1 point; a difference of two windows
// multiplies that error, so a derived rate rougher than this is left out.
const MAX_ROUNDING_ERROR = 0.5;
const SOURCE_ROUNDING = 0.05;

function window(slice: MetaTrendSlice | null): Window | null {
  if (!slice) return null;
  const rows = new Map(slice.items.map(row => [row.id, row]));
  // Popularity is the share of every game in the slice, so its most popular
  // row (the least relative rounding error) gives the slice's total games.
  let total: number | null = null;
  let bestPopularity = 0;
  for (const { games, popularity } of slice.items) {
    if (!games || !popularity || popularity <= bestPopularity) continue;
    bestPopularity = popularity;
    total = (games * 100) / popularity;
  }
  return { rows, total };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The sample of `long` outside `short` (`short` null: all of `long`), when it is large and exact enough. */
function difference(id: string, long: Window | null, short: Window | null | undefined, minGames: number): Sample | null {
  const outer = long?.rows.get(id);
  if (!outer?.games || outer.winrate === null) return null;
  if (short === undefined) {
    if (outer.games < minGames) return null;
    return { winrate: outer.winrate, popularity: outer.popularity, games: outer.games };
  }
  const inner = short?.rows.get(id);
  // Absent from the inner slice means fewer games than its floor, not zero: the split is unknown.
  if (!inner?.games || inner.winrate === null) return null;
  const games = outer.games - inner.games;
  if (games < minGames) return null;
  if ((SOURCE_ROUNDING * (outer.games + inner.games)) / games > MAX_ROUNDING_ERROR) return null;
  const winrate = (outer.winrate * outer.games - inner.winrate * inner.games) / games;
  if (winrate < 0 || winrate > 100) return null;
  const total = long?.total != null && short?.total != null ? long.total - short.total : null;
  const popularity = total !== null && total > games ? (games / total) * 100 : null;
  return { winrate: round(winrate), popularity: popularity === null ? null : round(popularity), games };
}

/**
 * Win-rate trend and the previous window of every archetype of `selected`.
 * `ladder` holds the rolling windows in STANDARD_META_ROLLING_PERIODS order
 * (null for a slice that failed to load), read at the source's lowest game
 * floor so an archetype is missing from a window only when it is rare there.
 * A release or patch window is compared with the rest of the last 30 days,
 * which holds only while that window lies inside them.
 */
export function buildStandardMetaTrends({ selected, ladder, minGames }: {
  selected: MetaTrendSlice;
  ladder: ReadonlyArray<MetaTrendSlice | null>;
  minGames: number;
}): StandardMetaTrends {
  const windows = STANDARD_META_ROLLING_PERIODS.map((period, index) => (
    ladder[index]?.period === period ? window(ladder[index]) : null
  ));
  const rollingIndex = STANDARD_META_ROLLING_PERIODS.indexOf(selected.period as StandardMetaRollingPeriod);
  const last30 = windows[windows.length - 1];
  const selectedWindow = window(selected);
  const beforeSelected = rollingIndex === -1 && last30 && selectedWindow
    && last30.total !== null && selectedWindow.total !== null && selectedWindow.total < last30.total;
  const comparison = rollingIndex === -1
    ? beforeSelected ? BEFORE_PERIOD : null
    : COMPARISONS[selected.period as keyof typeof COMPARISONS] ?? null;

  const items = selected.items.map((row): StandardMetaTrendItem => {
    const samples = windows.map((current, index) => difference(row.id, current, index === 0 ? undefined : windows[index - 1], minGames));
    let previous: Sample | null = null;
    if (rollingIndex !== -1 && comparison) previous = samples[rollingIndex + 1];
    else if (beforeSelected) previous = difference(row.id, last30, selectedWindow, minGames);
    return {
      id: row.id,
      winrates: samples.map(sample => sample?.winrate ?? null).reverse(),
      previous,
    };
  });
  return {
    period: selected.period,
    minGames,
    updatedAt: selected.updatedAt,
    buckets: [...BUCKET_LABELS].reverse(),
    comparison: items.some(item => item.previous) ? comparison : null,
    items,
  };
}
