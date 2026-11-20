import {
  decodeDeckDefinition,
  extractMainDeckCardCounts,
  indexCardsByDbf,
  resolveDeckCard,
  type DeckBuilderCardRecord,
} from './deckBuilderResolve.js';

/** One line of an open deck list: the card as the page prints it. Nothing else of the catalog row is copied. */
export type PublicDeckCard = { dbfId: number; name: string; cost: number; rarity: string; count: number };

/** Deck codes carry at most a few hundred characters; a longer string is not one. */
const MAX_CODE_LENGTH = 600;

/**
 * The main-deck list of a deck code against a card catalog, cheapest first,
 * or `null` when the code does not decode or any card is missing from the
 * catalog (a partial list would pass for the whole deck). Pure: it reads no
 * source of its own, so a page builds it from the catalog it already holds.
 * Sideboard modules (Zilliax, E.T.C.) are not listed.
 */
export function publicDeckCards(deckCode: string, catalog: Map<number, DeckBuilderCardRecord>): PublicDeckCard[] | null {
  if (typeof deckCode !== 'string' || deckCode.length > MAX_CODE_LENGTH) return null;
  const definition = decodeDeckDefinition(deckCode);
  if (!definition) return null;
  const counts = extractMainDeckCardCounts(definition);
  if (!counts.length) return null;
  const empty = new Map<number, DeckBuilderCardRecord>();
  const cards: PublicDeckCard[] = [];
  for (const { dbfId, count } of counts) {
    const card = resolveDeckCard(dbfId, count, catalog, empty, null);
    if (!card) return null;
    cards.push({ dbfId, name: card.name, cost: card.cost, rarity: card.rarity, count });
  }
  return cards.sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name, 'ru', { sensitivity: 'base' }));
}

/** The catalog index `publicDeckCards` reads, built once per catalog answer. */
export function publicDeckCatalog(cards: Record<string, unknown>[]): Map<number, DeckBuilderCardRecord> {
  return indexCardsByDbf(cards as DeckBuilderCardRecord[]);
}
