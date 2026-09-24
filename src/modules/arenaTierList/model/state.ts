import { TIERLIST_SOURCES, type TierlistData, type TierlistSource } from './types';

export type ArenaTierListState = {
  status: 'ready' | 'empty' | 'stale' | 'error';
  data: TierlistData | null;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Keep malformed or synthetic responses out of subscriber browser storage. */
export function parseArenaTierList(value: unknown): TierlistData | null {
  if (!object(value) || !Array.isArray(value.sections) || !object(value.cards)
    || !TIERLIST_SOURCES.includes(value.source as TierlistSource)
    || (value.updatedAt !== null && (typeof value.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(value.updatedAt))))) return null;
  for (const section of value.sections) {
    if (!object(section) || typeof section.id !== 'string' || !section.id
      || typeof section.name !== 'string' || !Array.isArray(section.tiers)) return null;
    for (const tier of section.tiers) {
      if (!object(tier) || typeof tier.tier !== 'string' || !Array.isArray(tier.cards)) return null;
      for (const card of tier.cards) {
        if (!object(card) || typeof card.cardId !== 'string' || !card.cardId
          || typeof card.name !== 'string' || typeof card.score !== 'number'
          || !Number.isFinite(card.score)) return null;
      }
    }
  }
  return value as unknown as TierlistData;
}

export function arenaTierListState(data: TierlistData, stale = false): ArenaTierListState {
  if (!data.sections.length) return { status: 'empty', data };
  return { status: stale || Boolean(data.warning) ? 'stale' : 'ready', data };
}
