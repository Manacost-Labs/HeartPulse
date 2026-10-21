import { DatasetContractError } from './datasetEnvelope.js';
import { isStandardMetaPeriod, type StandardMetaPeriod } from './standardMetaPeriods.js';

/**
 * Trends of one meta slice (docs/specs/standard-meta-trends.md): every number
 * is derived from HSGuru's nested rolling windows of the same format, rank and
 * coin, never interpolated. `winrates` follows `buckets`, oldest first; a null
 * marks a window whose sample is below the slice's minimum or whose rounding
 * error would exceed half a percentage point.
 */
export type StandardMetaTrendItem = {
  id: string;
  winrates: Array<number | null>;
  /** The window before the selected period; null when the source cannot isolate it. */
  previous: { winrate: number | null; popularity: number | null; games: number } | null;
};

export type StandardMetaTrends = {
  period: StandardMetaPeriod;
  minGames: number;
  updatedAt: string | null;
  /** Labels of the disjoint windows behind `winrates`, oldest first. */
  buckets: string[];
  /** What `previous` is measured against; null when the selected period has no earlier window. */
  comparison: { label: string; description: string } | null;
  items: StandardMetaTrendItem[];
};

function invalid(message: string): never {
  throw new DatasetContractError('INVALID_DATA', `standard-meta-trends: ${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) invalid(`${label} must be a string`);
  return value;
}

function rate(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) invalid(`${label} is outside 0..100`);
  return value;
}

function parsePrevious(value: unknown, label: string): StandardMetaTrendItem['previous'] {
  if (value === null) return null;
  const previous = record(value, label);
  if (typeof previous.games !== 'number' || !Number.isSafeInteger(previous.games) || previous.games < 0) {
    invalid(`${label}.games must be a non-negative integer`);
  }
  return {
    winrate: rate(previous.winrate, `${label}.winrate`),
    popularity: rate(previous.popularity, `${label}.popularity`),
    games: previous.games,
  };
}

/** Validates a `/api/standard-meta/trends` answer; throws DatasetContractError otherwise. */
export function parseStandardMetaTrends(value: unknown): StandardMetaTrends {
  const data = record(value, 'data');
  if (!isStandardMetaPeriod(data.period)) invalid('period is unsupported');
  if (typeof data.minGames !== 'number' || !Number.isSafeInteger(data.minGames)) invalid('minGames must be an integer');
  if (data.updatedAt !== null && typeof data.updatedAt !== 'string') invalid('updatedAt must be a string or null');
  if (!Array.isArray(data.buckets) || data.buckets.length > 12) invalid('buckets must be a short list');
  const buckets = data.buckets.map((bucket, index) => text(bucket, `buckets[${index}]`, 40));
  const comparison = data.comparison === null ? null : record(data.comparison, 'comparison');
  if (!Array.isArray(data.items) || data.items.length > 500) invalid('items must be a list');
  return {
    period: data.period,
    minGames: data.minGames,
    updatedAt: data.updatedAt as string | null,
    buckets,
    comparison: comparison && {
      label: text(comparison.label, 'comparison.label', 60),
      description: text(comparison.description, 'comparison.description'),
    },
    items: data.items.map((value, index) => {
      const item = record(value, `items[${index}]`);
      if (!Array.isArray(item.winrates) || item.winrates.length !== buckets.length) {
        invalid(`items[${index}].winrates must follow buckets`);
      }
      return {
        id: text(item.id, `items[${index}].id`, 80),
        winrates: item.winrates.map((winrate, bucket) => rate(winrate, `items[${index}].winrates[${bucket}]`)),
        previous: parsePrevious(item.previous, `items[${index}].previous`),
      };
    }),
  };
}
