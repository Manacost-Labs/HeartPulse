import type { StandardMatchupsData, StandardMatchupsFormat } from './types';

export type StandardMatchupsState = {
  status: 'ready' | 'empty' | 'stale' | 'error' | 'denied';
  data: StandardMatchupsData | null;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const rate = (value: unknown) => value === null
  || (typeof value === 'number' && Number.isFinite(value));

/** Check the protected matrix before caching or rendering it for a subscriber. */
export function parseStandardMatchups(value: unknown, expected: StandardMatchupsFormat): StandardMatchupsData | null {
  if (!object(value) || value.format !== expected || value.rank !== 'legend'
    || value.source !== 'hsguru' || typeof value.formatLabel !== 'string'
    || typeof value.rankLabel !== 'string' || !Array.isArray(value.columns)
    || !Array.isArray(value.rows)
    || (value.updatedAt !== null && (typeof value.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(value.updatedAt))))) return null;
  for (const column of value.columns) {
    if (!object(column) || typeof column.name !== 'string' || !column.name
      || (column.popularity !== null && typeof column.popularity !== 'string')) return null;
  }
  for (const row of value.rows) {
    if (!object(row) || typeof row.archetype !== 'string' || !row.archetype
      || !rate(row.winrate) || !Array.isArray(row.cells)) return null;
    for (const cell of row.cells) {
      if (!object(cell) || typeof cell.opponent !== 'string' || !cell.opponent
        || !rate(cell.winrate)) return null;
    }
  }
  return value as unknown as StandardMatchupsData;
}

export function standardMatchupsState(data: StandardMatchupsData, stale = false): StandardMatchupsState {
  if (!data.rows.length) return { status: 'empty', data };
  return { status: stale || Boolean(data.warning) ? 'stale' : 'ready', data };
}
