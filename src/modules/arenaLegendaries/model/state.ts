import type { LegendariesData } from './types';

export type ArenaLegendariesState = {
  status: 'ready' | 'empty' | 'stale' | 'error' | 'denied';
  data: LegendariesData | null;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const card = (value: unknown) => object(value)
  && typeof value.cardId === 'string' && Boolean(value.cardId)
  && typeof value.name === 'string';

/** Reject synthetic or malformed protected data before it reaches browser storage. */
export function parseArenaLegendaries(value: unknown): LegendariesData | null {
  if (!object(value) || !Array.isArray(value.groups)
    || !['hsreplay.net', 'firestoneapp.com'].includes(String(value.source))
    || (value.updatedAt !== null && (typeof value.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(value.updatedAt))))) return null;
  for (const group of value.groups) {
    if (!object(group) || !card(group.keyCard) || !Array.isArray(group.cards)
      || !group.cards.every(card) || typeof group.classKey !== 'string'
      || (group.winRate !== null && (typeof group.winRate !== 'number'
        || !Number.isFinite(group.winRate)))) return null;
  }
  return value as unknown as LegendariesData;
}

export function arenaLegendariesState(data: LegendariesData, stale = false): ArenaLegendariesState {
  if (!data.groups.length) return { status: 'empty', data };
  return { status: stale || Boolean(data.warning) ? 'stale' : 'ready', data };
}
