import type { LibraryIndexingFacts } from '../shared/battlegroundLibraryIndexing.js';
import type { PublicBattlegroundLibraryCard } from './battlegroundLibraryCardTypes.js';
import type { PublicLibraryMinionStats } from './battlegroundLibraryOpenStats.js';
import { canonicalBattlegroundCardSlug } from './modules/battlegroundLibrary/public.js';
import type { LibraryStatsStore } from './battlegroundLibraryOpenStats.js';

/** A card the open card page links to: identity only, nothing of the closed statistics. */
export type PublicLibraryRelatedCard = {
  dbfId: number;
  name: string;
  path: string;
  tavernTier: number | null;
  tribe: string | null;
};

export const RELATED_CARD_LIMIT = 6;

const nameOrder = (left: PublicBattlegroundLibraryCard, right: PublicBattlegroundLibraryCard) =>
  left.nameRu.localeCompare(right.nameRu, 'ru') || left.dbfId - right.dbfId;

/**
 * Related cards by tags the catalog states: for a minion those of the same tribe (the nearest tavern
 * tiers first), for a spell those of the same tavern tier. Same pool state as the card, never the card
 * itself. No hand-written text: the rule is the whole explanation.
 */
export function relatedLibraryCards(
  card: PublicBattlegroundLibraryCard,
  catalog: readonly PublicBattlegroundLibraryCard[],
  prefix: '/library' | '/library/archive',
): PublicLibraryRelatedCard[] {
  const kindPath = card.kind === 'minion' ? 'minions' : 'spells';
  const sameTag = (other: PublicBattlegroundLibraryCard) => card.kind === 'minion'
    ? card.tribe !== null && other.tribe === card.tribe
    : card.tavernTier !== null && other.tavernTier === card.tavernTier;
  const distance = (other: PublicBattlegroundLibraryCard) =>
    Math.abs((other.tavernTier ?? 0) - (card.tavernTier ?? 0));
  return catalog
    .filter(other => other.dbfId !== card.dbfId && other.kind === card.kind && other.inPool === card.inPool && sameTag(other))
    .sort((left, right) => distance(left) - distance(right) || nameOrder(left, right))
    .slice(0, RELATED_CARD_LIMIT)
    .map(other => ({
      dbfId: other.dbfId, name: other.nameRu, tavernTier: other.tavernTier, tribe: other.tribe,
      path: `${prefix}/${kindPath}/${canonicalBattlegroundCardSlug(other.nameRu)}-${other.dbfId}/`,
    }));
}

/** The facts the open card page states, in the shape the one indexing rule reads. */
export function libraryCardIndexingFacts(
  card: PublicBattlegroundLibraryCard,
  stats: PublicLibraryMinionStats | null,
): LibraryIndexingFacts {
  return {
    name: card.nameRu, typeName: card.typeName, tavernTier: card.tavernTier, tribe: card.tribe,
    attack: card.attack, health: card.health, text: card.textRu, mechanicCount: card.mechanics.length,
    goldenAttack: card.golden?.attack ?? null, goldenHealth: card.golden?.health ?? null,
    stats,
  };
}

/**
 * The open layer of a card for the card route: its base statistics (a rejection is a 503, never a page without the
 * figures it counts as facts) and related cards. Related cards come from the catalog the router already holds: a card
 * page never waits for (or starts) the bulk read of every pool, which is what the single-card identity exists to
 * avoid; a cold start warms the catalog behind the answer.
 */
export function createLibraryOpenLayerLoader(options: {
  stats: LibraryStatsStore;
  catalog: { peek: (kind: 'minion' | 'spell') => PublicBattlegroundLibraryCard[] | undefined;
    load: (kind: 'minion' | 'spell') => Promise<PublicBattlegroundLibraryCard[]> };
}) {
  return async (card: PublicBattlegroundLibraryCard, archive: boolean) => {
    const slice = card.kind === 'minion' && card.inPool && !archive ? (await options.stats.get()).slice : null;
    const figures = slice?.byDbf.get(card.dbfId);
    const held = options.catalog.peek(card.kind);
    if (!held) void options.catalog.load(card.kind).catch(() => undefined);
    return {
      stats: slice && figures ? { ...figures, updatedAt: slice.updatedAt } : null,
      related: held ? relatedLibraryCards(card, held, archive ? '/library/archive' : '/library') : [],
    };
  };
}
