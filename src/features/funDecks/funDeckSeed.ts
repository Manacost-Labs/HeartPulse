import type { FunDeckRow } from '../funDecksPreview';
import type { FunDeckCard } from './deckEntries';

/** What a card nobody names is called: the open list keeps its place and count. */
export const UNKNOWN_CARD_NAME = 'Неизвестная карта';

/**
 * The deck's open card list (`cards` of the public answer) as the cards of the
 * deck views, so the server HTML draws the same tiles a reader sees after the
 * full list arrives. A card without an id keeps its line without art or link;
 * one outside the format's catalog keeps its name without a link. `null`: the
 * answer has no list for this deck (its code did not decode).
 */
export function funDeckSeed(deck: Pick<FunDeckRow, 'cards'>, format: 'standard' | 'wild'): FunDeckCard[] | null {
  if (!deck.cards?.length) return null;
  return deck.cards.map((card, index) => ({
    id: card.id ?? '', dbfId: index + 1, name: card.name ?? UNKNOWN_CARD_NAME, cost: card.cost ?? 0,
    rarity: 'COMMON', elite: false, count: card.count, image: '',
    pagePath: card.hasPage && card.id ? `/standard/cards/${format}/${encodeURIComponent(card.id)}/` : null,
  }));
}
