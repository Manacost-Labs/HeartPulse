import type { DeckListSideboard } from '../decklist/DeckListView';
import type { FunDeckOpenCard, FunDeckRow } from '../funDecksPreview';
import type { FunDeckCard } from './deckEntries';

/** What a card nobody names is called: the open list keeps its place and count. */
export const UNKNOWN_CARD_NAME = 'Неизвестная карта';

/** Sideboard cards take ids after the main list's, so every card of the seed has its own key. */
const SIDEBOARD_IDS_FROM = 1_000;

function seedCard(card: FunDeckOpenCard, dbfId: number, format: 'standard' | 'wild'): FunDeckCard {
  return {
    id: card.id ?? '', dbfId, name: card.name ?? UNKNOWN_CARD_NAME, cost: card.cost ?? 0,
    rarity: 'COMMON', elite: false, count: card.count, image: '',
    pagePath: card.hasPage && card.id ? `/standard/cards/${format}/${encodeURIComponent(card.id)}/` : null,
  };
}

/**
 * The deck's open card list (`cards` and `sideboards` of the public answer) as
 * the cards of the deck views, so the server HTML draws the same tiles, the
 * E.T.C. band and Zilliax's modules included, that a reader sees once the full
 * list arrives. A card without an id keeps its line without art or link; one
 * outside the format's catalog keeps its name without a link. `null`: the
 * answer has no list for this deck (its code did not decode).
 */
export function funDeckSeed(deck: Pick<FunDeckRow, 'cards' | 'sideboards'>, format: 'standard' | 'wild'):
  { cards: FunDeckCard[]; sideboards: DeckListSideboard[] } | null {
  if (!deck.cards?.length) return null;
  const cards = deck.cards.map((card, index) => seedCard(card, index + 1, format));
  let next = SIDEBOARD_IDS_FROM;
  const sideboards = (deck.sideboards ?? []).flatMap(board => {
    const key = cards.find(card => card.id === board.keyId);
    if (!key) return [];
    return [{ keyCardDbfId: key.dbfId, label: key.name, keyCard: key, cards: board.cards.map(card => seedCard(card, next++, format)) }];
  });
  return { cards, sideboards };
}
