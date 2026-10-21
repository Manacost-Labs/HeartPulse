/*
 * Pure statistics behind MetaTable and MatchupMatrix. Rates are fractions (0.523 = 52.3%). Win rates carry a
 * Wilson interval, so a 70% from 40 games reads as the guess it is; matchups are looked up both ways round.
 */
import type { GameImageSource } from './game';

/** Wilson score interval of a rate measured on `n` trials; [0, 1] without data. */
export function wilsonInterval(p: number, n: number, z = 1.96): [number, number] {
  if (!(n > 0) || !Number.isFinite(p)) return [0, 1];
  const rate = Math.min(1, Math.max(0, p));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (rate + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((rate * (1 - rate)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/* ── Meta table ── */

/** The rates a meta table compares with the previous patch. */
export type MetaRate = 'winRate' | 'pickRate' | 'banRate';

export interface MetaTableStats {
  /** Games played in this rank. */
  games: number;
  winRate: number;
  /** Share of games the entry is picked in. */
  pickRate?: number;
  /** Share of games the entry is banned in. */
  banRate?: number;
  /** Tier id from the table's `tiers`; without it the win-rate thresholds pick one. */
  tier?: string;
  /** The same rates on the previous patch: each rate shows its change against them. */
  previous?: Partial<Record<MetaRate, number>>;
}

export interface MetaTableEntry {
  id: string;
  /** Champion, hero or deck name. */
  name: string;
  /** Portrait: an image URL or a node. Without it, the initials on the role colour. */
  image?: GameImageSource;
  /** Role id from the table's `roles`: the role column and the role filter read it. */
  role?: string;
  /** Stats per rank id. */
  stats: Record<string, MetaTableStats>;
}

export type MetaTableSortKey = 'name' | 'tier' | MetaRate | 'games';
export interface MetaTableSort {
  key: MetaTableSortKey;
  direction: 'asc' | 'desc';
}

export interface MetaTableRow {
  entry: MetaTableEntry;
  stats: MetaTableStats;
  /** 95% Wilson interval of the win rate. */
  interval: [number, number];
  /** Change of each rate against the previous patch, where both are known. */
  delta: Partial<Record<MetaRate, number>>;
  /** Fewer games than `minGames`. */
  lowSample: boolean;
}

const RATES: MetaRate[] = ['winRate', 'pickRate', 'banRate'];

/** Rows for one rank; entries without stats there are left out. */
export function metaTableRows(entries: readonly MetaTableEntry[], rank: string, minGames = 0): MetaTableRow[] {
  return entries.flatMap((entry) => {
    const stats = entry.stats[rank];
    if (!stats || !Number.isFinite(stats.winRate)) return [];
    const delta: Partial<Record<MetaRate, number>> = {};
    for (const rate of RATES) {
      const now = stats[rate];
      const before = stats.previous?.[rate];
      if (now !== undefined && before !== undefined && Number.isFinite(now) && Number.isFinite(before)) delta[rate] = now - before;
    }
    return [{ entry, stats, interval: wilsonInterval(stats.winRate, stats.games), delta, lowSample: stats.games < minGames }];
  });
}

/**
 * Sorted copy. The win rate keeps low-sample rows after the rest (their numbers are guesses), rows without a value
 * go last; ties fall back to the name. `tierOrder` ranks the tier column (0 = best).
 */
export function sortMetaTable(rows: readonly MetaTableRow[], sort: MetaTableSort, locale?: string, tierOrder?: (row: MetaTableRow) => number): MetaTableRow[] {
  const collator = new Intl.Collator(locale);
  const sign = sort.direction === 'asc' ? 1 : -1;
  const value = (row: MetaTableRow): number | undefined => {
    switch (sort.key) {
      case 'tier':
        // Best tier first when descending, like the rates.
        return tierOrder ? -tierOrder(row) : undefined;
      case 'games':
        return row.stats.games;
      case 'name':
        return undefined;
      default:
        return row.stats[sort.key];
    }
  };
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return sign * collator.compare(a.entry.name, b.entry.name);
    if ((sort.key === 'winRate' || sort.key === 'tier') && a.lowSample !== b.lowSample) return a.lowSample ? 1 : -1;
    const x = value(a);
    const y = value(b);
    if (x === undefined || y === undefined) return x === y ? collator.compare(a.entry.name, b.entry.name) : x === undefined ? 1 : -1;
    return sign * (x - y) || (sort.key === 'tier' ? b.stats.winRate - a.stats.winRate : 0) || collator.compare(a.entry.name, b.entry.name);
  });
}

/* ── Matchups ── */

export interface Matchup {
  /** The deck (row) whose win rate this is. */
  a: string;
  /** The opponent (column). */
  b: string;
  /** Win rate of `a` against `b`. */
  winRate: number;
  games: number;
}

export interface MatchupCell {
  winRate: number;
  games: number;
  /** Read from the opposite pairing (b vs a), as 1 − its win rate. */
  mirrored: boolean;
}

/** Looks a pairing up either way round; a mirror match without data is an even 50% on no games. */
export function matchupLookup(matchups: readonly Matchup[]): (a: string, b: string) => MatchupCell | undefined {
  const map = new Map<string, Matchup>();
  for (const m of matchups) if (Number.isFinite(m.winRate)) map.set(`${m.a}\u0000${m.b}`, m);
  return (a, b) => {
    const direct = map.get(`${a}\u0000${b}`);
    if (direct) return { winRate: direct.winRate, games: direct.games, mirrored: false };
    const other = map.get(`${b}\u0000${a}`);
    if (other) return { winRate: 1 - other.winRate, games: other.games, mirrored: true };
    return a === b ? { winRate: 0.5, games: 0, mirrored: false } : undefined;
  };
}

/**
 * Win rate of `id` against the field: matchups weighted by how often each opponent is met (`share`, any scale).
 * `coverage` is the share of the field with data. Without shares every opponent counts the same.
 */
export function fieldWinRate(
  id: string,
  opponents: readonly string[],
  lookup: (a: string, b: string) => MatchupCell | undefined,
  share?: Readonly<Record<string, number>>,
): { winRate: number; coverage: number } | undefined {
  let sum = 0;
  let weight = 0;
  let total = 0;
  for (const other of opponents) {
    const w = share ? Math.max(0, share[other] ?? 0) : 1;
    total += w;
    const cell = lookup(id, other);
    if (!cell || w === 0) continue;
    sum += cell.winRate * w;
    weight += w;
  }
  if (weight === 0) return undefined;
  return { winRate: sum / weight, coverage: total > 0 ? weight / total : 0 };
}
