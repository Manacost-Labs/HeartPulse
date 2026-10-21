import { wilsonInterval } from '../vendor/varylo-ui/gaming/stats';
import type { StandardMetaItem } from '../../shared/standardMetaContract';
import {
  STANDARD_META_TIER_FLOORS,
  standardMetaTier,
  standardMetaTierBound,
  type StandardMetaTier,
} from './standardMetaClassModel';

/** Fewer games than this: the win rate is a rough estimate and is drawn muted. */
export const STANDARD_META_LOW_SAMPLE_GAMES = 500;

export type StandardMetaWinrateEstimate = {
  winrate: number;
  /** The 95% Wilson interval, in percent. */
  low: number;
  high: number;
  lowSample: boolean;
};

export function standardMetaWinrateEstimate(winrate: number | null, games: number | null): StandardMetaWinrateEstimate | null {
  if (winrate === null || !games || games <= 0) return null;
  const [low, high] = wilsonInterval(winrate / 100, games);
  return { winrate, low: low * 100, high: high * 100, lowSample: games < STANDARD_META_LOW_SAMPLE_GAMES };
}

// The win-rate bar spans 35–65%: the whole HSGuru meta above 100 games fits,
// and a point of win rate stays wide enough to read against the 50% mark.
const AXIS_MIN = 35;
const AXIS_MAX = 65;

/** Position of a win rate on the bar, 0–100 (%), clamped to the axis. */
export function standardMetaWinrateAxis(value: number): number {
  return Math.min(100, Math.max(0, ((value - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100));
}

export type StandardMetaSortKey = 'archetype' | 'winrate' | 'popularity' | 'games' | 'turns' | 'durationMinutes' | 'climbingSpeed';
export type StandardMetaSort = { key: StandardMetaSortKey | null; direction: 'asc' | 'desc' };

/** Sorted copy; blanks go last and ties keep the source order (`rankById`). */
export function sortStandardMetaItems(
  items: readonly StandardMetaItem[],
  sort: StandardMetaSort,
  rankById: ReadonlyMap<string, number>,
): StandardMetaItem[] {
  const { key } = sort;
  if (!key) return [...items];
  const multiplier = sort.direction === 'asc' ? 1 : -1;
  const sourceOrder = (left: StandardMetaItem, right: StandardMetaItem) => (rankById.get(left.id) ?? 0) - (rankById.get(right.id) ?? 0);
  return [...items].sort((left, right) => {
    const leftValue = key === 'archetype' ? left.archetypeLabel : left[key];
    const rightValue = key === 'archetype' ? right.archetypeLabel : right[key];
    if (leftValue === null && rightValue === null) return sourceOrder(left, right);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    const comparison = typeof leftValue === 'string'
      ? leftValue.localeCompare(String(rightValue), 'ru', { sensitivity: 'base' })
      : leftValue - Number(rightValue);
    return comparison === 0 ? sourceOrder(left, right) : comparison * multiplier;
  });
}

export type StandardMetaTierEntry = { item: StandardMetaItem; estimate: StandardMetaWinrateEstimate; bound: number };
export type StandardMetaTierGroup = {
  tier: StandardMetaTier;
  /** The tier's lowest bound, in percent; D has none. */
  floor: number | null;
  entries: StandardMetaTierEntry[];
};

/** S to D, each tier best bound first. Rows without a win rate or games have no tier and are left out. */
export function standardMetaTierGroups(items: readonly StandardMetaItem[]): StandardMetaTierGroup[] {
  const floors = new Map<StandardMetaTier, number>(STANDARD_META_TIER_FLOORS);
  const groups = (['S', 'A', 'B', 'C', 'D'] as const).map((tier): StandardMetaTierGroup => ({ tier, floor: floors.get(tier) ?? null, entries: [] }));
  for (const item of items) {
    const estimate = standardMetaWinrateEstimate(item.winrate, item.games);
    if (!estimate || item.games === null) continue;
    const tier = standardMetaTier(estimate.winrate, item.games);
    groups.find(group => group.tier === tier)?.entries.push({ item, estimate, bound: standardMetaTierBound(estimate.winrate, item.games) });
  }
  for (const group of groups) group.entries.sort((left, right) => right.bound - left.bound);
  return groups;
}
