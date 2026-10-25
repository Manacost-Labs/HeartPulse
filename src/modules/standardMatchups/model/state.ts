import { STANDARD_MATCHUPS_RANKS, type StandardMatchupsData, type StandardMatchupsFormat } from './types';

export type StandardMatchupsState = {
  status: 'ready' | 'empty' | 'stale' | 'error' | 'denied';
  data: StandardMatchupsData | null;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const rate = (value: unknown) => value === null
  || (typeof value === 'number' && Number.isFinite(value));
const CLASS_KEYS = new Set(['deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue',
  'shaman', 'warlock', 'warrior']);
// Optional: responses cached before the field existed still parse.
const classKey = (value: unknown) => value === undefined || value === null
  || (typeof value === 'string' && CLASS_KEYS.has(value));
const RANKS = new Set<string>(STANDARD_MATCHUPS_RANKS);
const games = (value: unknown) => value === undefined
  || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string');
const available = (value: unknown) => value === undefined || (object(value)
  && strings(value.ranks) && strings(value.periods)
  && Array.isArray(value.minGames) && value.minGames.every(item => typeof item === 'number'));

/** Check the protected matrix before caching or rendering it for a subscriber. */
export function parseStandardMatchups(value: unknown, expected: StandardMatchupsFormat): StandardMatchupsData | null {
  if (!object(value) || value.format !== expected || typeof value.rank !== 'string' || !RANKS.has(value.rank)
    || (value.period !== undefined && value.period !== null && typeof value.period !== 'string')
    || !games(value.minGames) || !available(value.available)
    || value.source !== 'hsguru' || typeof value.formatLabel !== 'string'
    || typeof value.rankLabel !== 'string' || !Array.isArray(value.columns)
    || !Array.isArray(value.rows)
    || (value.updatedAt !== null && (typeof value.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(value.updatedAt))))) return null;
  for (const column of value.columns) {
    if (!object(column) || typeof column.name !== 'string' || !column.name
      || (column.popularity !== null && typeof column.popularity !== 'string')
      || !classKey(column.classKey) || !games(column.games)) return null;
  }
  for (const row of value.rows) {
    if (!object(row) || typeof row.archetype !== 'string' || !row.archetype
      || !rate(row.winrate) || !Array.isArray(row.cells) || !classKey(row.classKey) || !games(row.games)) return null;
    for (const cell of row.cells) {
      if (!object(cell) || typeof cell.opponent !== 'string' || !cell.opponent
        || !rate(cell.winrate) || !games(cell.games)) return null;
    }
  }
  return value as unknown as StandardMatchupsData;
}

export function standardMatchupsState(data: StandardMatchupsData, stale = false): StandardMatchupsState {
  if (!data.rows.length) return { status: 'empty', data };
  return { status: stale || Boolean(data.warning) ? 'stale' : 'ready', data };
}
