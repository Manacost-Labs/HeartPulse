import type {
  MetaReportSnapshot, ReportArena, ReportBattlegrounds, ReportHero, ReportMatchups, ReportStandard, ReportStandardItem,
} from './publicMetaReportData';

/*
 * What a weekly meta report says (issue #542, «Решение по формату»), computed
 * from its snapshot and the one before it. Every figure is a snapshot figure
 * or the difference of two; the difference exists only when both Standard
 * sections are of the same HSGuru period, because HSGuru accumulates games
 * inside a period and starts again at the next one.
 */

export const REPORT_TOP = 10;
/** An archetype rarer than this (percent of games) is not ranked by winrate: its winrate is noise. */
export const REPORT_MIN_POPULARITY = 0.5;
export const REPORT_MATCHUP_ARCHETYPES = 5;
/** A pair with fewer games has no reliable winrate. */
export const REPORT_MIN_MATCHUP_GAMES = 25;
/** An Arena class with fewer runs is not ranked: «мало данных». */
export const REPORT_MIN_ARENA_SAMPLE = 100;
/** A patch younger than this at the snapshot gives early, unsettled data. */
const EARLY_PATCH_MS = 72 * 60 * 60_000;
const WEEK_MS = 7 * 24 * 60 * 60_000;

export type ArchetypeRow = ReportStandardItem & {
  /** Percentage points against the previous report; `null` without a comparable report or row. */
  winrateDelta: number | null;
  popularityDelta: number | null;
  /** Games of the week: the difference of the accumulated games. */
  gamesDelta: number | null;
  /** Not in the same list of the previous comparable report. */
  entered: boolean;
};

export type StandardView = {
  section: MetaReportSnapshot['sections']['standard'];
  data: ReportStandard;
  byWinrate: ArchetypeRow[];
  byPopularity: ArchetypeRow[];
  /** Names that left the winrate top since the previous comparable report. */
  leftByWinrate: string[];
  leftByPopularity: string[];
};

export type Comparison =
  | { kind: 'first' }
  /** `weekly`: the previous report is exactly 7 days older; otherwise a week (or more) was not recorded in between. */
  | { kind: 'same-period'; previousDate: string; weekly: boolean }
  | { kind: 'period-changed'; previousDate: string; previousPeriod: string | null; period: string | null };

export type MatchupView = {
  archetype: string; label: string;
  best: { opponent: string; winrate: number; games: number } | null;
  worst: { opponent: string; winrate: number; games: number } | null;
};

export type ArenaView = {
  ranked: { place: number; id: string; name: string; winrate: number | null; sample: number }[];
  lowSample: { id: string; name: string; sample: number | null }[];
  sampleUnit: string | null;
};

export type MetaReportView = {
  date: string;
  comparison: Comparison;
  standard: StandardView;
  matchups: MatchupView[] | null;
  arena: ArenaView | null;
  heroes: ReportHero[] | null;
  /** The newest patch at the snapshot and whether it came out in the week of the report. */
  patch: { version: string; title: string | null; publishedAt: string; thisWeek: boolean } | null;
  /** The patch is younger than 72 hours at the snapshot: the figures are early. */
  earlyData: boolean;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const difference = (current: number | null, previous: number | null | undefined) =>
  current === null || previous === null || previous === undefined ? null : round1(current - previous);

const byWinrate = (items: ReportStandardItem[]) => items
  .filter(item => item.winrate !== null && (item.popularity ?? 0) >= REPORT_MIN_POPULARITY)
  .sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0) || (b.games ?? 0) - (a.games ?? 0))
  .slice(0, REPORT_TOP);
const byPopularity = (items: ReportStandardItem[]) => items
  .filter(item => item.popularity !== null)
  .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || (b.games ?? 0) - (a.games ?? 0))
  .slice(0, REPORT_TOP);

function comparisonOf(current: MetaReportSnapshot, previous: MetaReportSnapshot | null): Comparison {
  const before = previous?.sections.standard.data;
  const period = current.sections.standard.data?.period ?? null;
  if (!previous || !before) return { kind: 'first' };
  return period && period === before.period
    ? { kind: 'same-period', previousDate: previous.date, weekly: Date.parse(current.date) - Date.parse(previous.date) === WEEK_MS }
    : { kind: 'period-changed', previousDate: previous.date, previousPeriod: before.period, period };
}

function ranked(list: ReportStandardItem[], previousList: ReportStandardItem[] | null, previous: ReportStandardItem[] | null): ArchetypeRow[] {
  const before = new Map((previous ?? []).map(item => [item.slug, item]));
  const listedBefore = new Set((previousList ?? []).map(item => item.slug));
  return list.map(item => {
    const old = previous ? before.get(item.slug) : undefined;
    const games = old ? difference(item.games, old.games) : null;
    return {
      ...item,
      winrateDelta: old ? difference(item.winrate, old.winrate) : null,
      popularityDelta: old ? difference(item.popularity, old.popularity) : null,
      gamesDelta: games !== null && games >= 0 ? Math.round(games) : null,
      entered: previousList !== null && !listedBefore.has(item.slug),
    };
  });
}

function standardView(current: MetaReportSnapshot, previous: ReportStandard | null): StandardView {
  const data = current.sections.standard.data as ReportStandard;
  const winrateTop = byWinrate(data.items);
  const popularityTop = byPopularity(data.items);
  const previousWinrateTop = previous ? byWinrate(previous.items) : null;
  const previousPopularityTop = previous ? byPopularity(previous.items) : null;
  const left = (before: ReportStandardItem[] | null, now: ReportStandardItem[]) => (before ?? [])
    .filter(item => !now.some(row => row.slug === item.slug)).map(item => item.name);
  return {
    section: current.sections.standard, data,
    byWinrate: ranked(winrateTop, previousWinrateTop, previous?.items ?? null),
    byPopularity: ranked(popularityTop, previousPopularityTop, previous?.items ?? null),
    leftByWinrate: left(previousWinrateTop, winrateTop),
    leftByPopularity: left(previousPopularityTop, popularityTop),
  };
}

function matchupView(data: ReportMatchups | null): MatchupView[] | null {
  if (!data) return null;
  const labels = new Map([...data.columns.map(column => [column.name, column.label] as const),
    ...data.rows.map(row => [row.archetype, row.archetypeLabel] as const)]);
  const views = [...data.rows].sort((a, b) => (b.games ?? 0) - (a.games ?? 0)).slice(0, REPORT_MATCHUP_ARCHETYPES).map(row => {
    const pairs = row.cells
      .filter(cell => cell.opponent !== row.archetype && cell.winrate !== null && (cell.games ?? 0) >= REPORT_MIN_MATCHUP_GAMES)
      .map(cell => ({ opponent: labels.get(cell.opponent) ?? cell.opponent, winrate: cell.winrate as number, games: cell.games as number }))
      .sort((a, b) => b.winrate - a.winrate || b.games - a.games);
    return {
      archetype: row.archetype, label: row.archetypeLabel,
      best: pairs[0] ?? null, worst: pairs.length > 1 ? pairs[pairs.length - 1] : null,
    };
  });
  return views.length ? views : null;
}

function arenaView(data: ReportArena | null): ArenaView | null {
  if (!data) return null;
  const enough = data.classes.filter(item => (item.sample ?? 0) >= REPORT_MIN_ARENA_SAMPLE)
    .sort((a, b) => (b.winrate ?? -1) - (a.winrate ?? -1) || (b.sample ?? 0) - (a.sample ?? 0));
  return {
    sampleUnit: data.sampleUnit,
    ranked: enough.map((item, index) => ({ place: index + 1, id: item.id, name: item.name, winrate: item.winrate, sample: item.sample as number })),
    lowSample: data.classes.filter(item => (item.sample ?? 0) < REPORT_MIN_ARENA_SAMPLE)
      .map(item => ({ id: item.id, name: item.name, sample: item.sample })),
  };
}

const heroView = (data: ReportBattlegrounds | null): ReportHero[] | null => {
  const heroes = (data?.heroes ?? []).filter(hero => hero.avgPlacement !== null)
    .sort((a, b) => (a.avgPlacement as number) - (b.avgPlacement as number) || (b.top4Rate ?? 0) - (a.top4Rate ?? 0))
    .slice(0, REPORT_TOP);
  return heroes.length ? heroes : null;
};

/** The report of `current`; `previous` is the snapshot right before it (any period), or `null` for the first report. */
export function buildMetaReportView(current: MetaReportSnapshot, previous: MetaReportSnapshot | null): MetaReportView {
  const data = current.sections.standard.data as ReportStandard;
  const comparison = comparisonOf(current, previous);
  const patchData = current.sections.patch.data;
  const taken = Date.parse(current.recordedAt);
  const released = patchData ? Date.parse(patchData.publishedAt) : Number.NaN;
  return {
    date: current.date,
    comparison,
    standard: standardView(current, comparison.kind === 'same-period' ? previous?.sections.standard.data ?? null : null),
    matchups: matchupView(current.sections.matchups.data),
    // A stale or missing source is not a ranking of the snapshot day: the section is skipped and says why.
    arena: current.sections.arena.status === 'fresh' ? arenaView(current.sections.arena.data) : null,
    heroes: current.sections.battlegrounds.status === 'fresh' ? heroView(current.sections.battlegrounds.data) : null,
    patch: patchData ? { ...patchData, thisWeek: taken - released >= 0 && taken - released < WEEK_MS } : null,
    earlyData: Number.isFinite(released) && taken - released >= 0 && taken - released < EARLY_PATCH_MS,
  };
}
