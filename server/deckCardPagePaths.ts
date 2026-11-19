import type {
  DeckBuilderCardRecord,
  DeckBuilderFormat,
  DeckBuilderResolvedCard,
  DeckBuilderResolveResult,
} from './deckBuilderResolve.js';

/**
 * Links a resolved deck to card pages. A page exists only for cards in the
 * collectible constructed catalogs; the deck code also carries tokens such as
 * Zilliax modules, which have none. A Core reprint missing from the catalog
 * links to its original card.
 */
export function withCardPagePaths(
  result: DeckBuilderResolveResult,
  catalogs: Record<DeckBuilderFormat, readonly DeckBuilderCardRecord[]>,
): DeckBuilderResolveResult {
  const idsOf = (cards: readonly DeckBuilderCardRecord[]) => new Set(
    cards.map(card => String(card.card_id || card.id || '').trim()).filter(Boolean),
  );
  const ids: Record<DeckBuilderFormat, Set<string>> = { standard: idsOf(catalogs.standard), wild: idsOf(catalogs.wild) };
  const formats: DeckBuilderFormat[] = result.format === 'wild' ? ['wild'] : ['standard', 'wild'];
  const pagePath = (cardId: string): string | null => {
    const candidates = cardId.startsWith('CORE_') ? [cardId, cardId.slice(5)] : [cardId];
    for (const format of formats) {
      const found = candidates.find(candidate => ids[format].has(candidate));
      if (found) return `/standard/cards/${format}/${encodeURIComponent(found)}/`;
    }
    return null;
  };
  const link = (card: DeckBuilderResolvedCard): DeckBuilderResolvedCard => ({ ...card, pagePath: pagePath(card.id) });
  return {
    ...result,
    cards: result.cards.map(link),
    sideboards: result.sideboards.map(sideboard => ({
      ...sideboard,
      keyCard: sideboard.keyCard ? link(sideboard.keyCard) : null,
      cards: sideboard.cards.map(link),
    })),
  };
}
