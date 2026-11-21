import type { DeckListCard, DeckListSideboard } from '../decklist/DeckListView';

/** The payload `useResolvedDeck` would return for the same deck, built from the open card list. */
export function seededDeck(deckCode: string, format: 'standard' | 'wild', cards: readonly DeckListCard[], sideboards: readonly DeckListSideboard[] = []) {
  const total = cards.reduce((sum, card) => sum + card.count, 0);
  return {
    ok: true, format, heroDbfId: 0, deckCode, cards: [...cards], sideboards: [...sideboards], totalCards: total,
    deckSizeLimit: total > 30 ? 40 as const : 30 as const, archetype: null,
  };
}
