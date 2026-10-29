import type { ArchetypeCatalog, ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import { INDEXABLE_ARCHETYPE_MIN_GAMES, isIndexableArchetype } from '@/shared/constructedArchetypeIndexing';

type CatalogRow = ArchetypeCatalog['items'][number];

/** Same-class links under the summary: enough to cross-link the class, not a second catalog. */
export const SUMMARY_NEIGHBOURS_MAX = 6;
// A median of fewer rows is an anecdote, not a yardstick.
const MIN_ROWS_FORMAT = 5;
const MIN_ROWS_CLASS = 3;
/** A difference below this (in percentage points) is printed as «на уровне медианы». */
const LEVEL_WITH_MEDIAN = 0.05;

export type MedianComparison = {
  /** Archetypes in the sample the median is taken over. */
  archetypes: number;
  median: number;
  /** The archetype's winrate minus the median, in percentage points. */
  delta: number;
};

export type ArchetypeSeoFacts = {
  /** Against all archetypes of the format that have a readable sample. */
  formatComparison: MedianComparison | null;
  /** Against those of the archetype's own class. */
  classComparison: MedianComparison | null;
  /** The archetype's place by games among every catalog row, or `null` when the catalog lacks it. */
  gamesPlace: { place: number; of: number } | null;
  /** Other archetypes of the class, indexable pages first, then by games. */
  neighbours: CatalogRow[];
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The rows whose winrate says something: a known winrate over a sample the page itself would call readable. */
function readable(rows: readonly CatalogRow[]): CatalogRow[] {
  return rows.filter(row => row.winrate !== null && row.games >= INDEXABLE_ARCHETYPE_MIN_GAMES);
}

function compare(winrate: number | null, rows: readonly CatalogRow[], minRows: number): MedianComparison | null {
  if (winrate === null || rows.length < minRows) return null;
  const value = median(rows.map(row => row.winrate as number));
  return { archetypes: rows.length, median: value, delta: winrate - value };
}

/** Whether the difference to the median is too small to call higher or lower. */
export function isLevelWithMedian(comparison: MedianComparison): boolean {
  return Math.abs(comparison.delta) < LEVEL_WITH_MEDIAN;
}

/**
 * What the summary says beyond the archetype's own numbers, computed from the
 * public catalog teaser alone (the same whitelisted rows the catalog page
 * prints; builds are always empty there). `catalog` is the one of the page's
 * format; without it only the archetype's own facts remain.
 */
export function archetypeSeoFacts(item: ArchetypeDetail['item'], catalog: Pick<ArchetypeCatalog, 'items'> | null): ArchetypeSeoFacts {
  const rows = catalog?.items ?? [];
  const sample = readable(rows);
  const sameClass = item.classKey ? readable(rows.filter(row => row.classKey === item.classKey)) : [];
  const listed = rows.some(row => row.slug === item.slug);
  return {
    formatComparison: compare(item.winrate, sample, MIN_ROWS_FORMAT),
    classComparison: compare(item.winrate, sameClass, MIN_ROWS_CLASS),
    gamesPlace: listed ? { place: 1 + rows.filter(row => row.games > item.games).length, of: rows.length } : null,
    neighbours: item.classKey
      ? rows.filter(row => row.classKey === item.classKey && row.slug !== item.slug)
        .sort((left, right) => Number(isIndexableArchetype(right)) - Number(isIndexableArchetype(left))
          || right.games - left.games || left.slug.localeCompare(right.slug))
        .slice(0, SUMMARY_NEIGHBOURS_MAX)
      : [],
  };
}
