import {
  decodeDeckDefinition,
  extractMainDeckCardCounts,
  indexCardsByDbf,
  resolveDeckCard,
  type DeckBuilderCardRecord,
} from './deckBuilderResolve.js';

type Format = 'standard' | 'wild';

/** One line of a fun deck's card list: `id` is the catalog id, so `/standard/cards/<format>/<id>/` exists for it. */
export type FunDeckOpenCard = { id: string; name: string; cost: number; count: number };

export type FunDeckCardCatalogLoader = (format: Format) => Promise<{ cards: Record<string, unknown>[] }>;

/** Deck codes carry at most a few hundred characters; a longer string is not one. */
const MAX_CODE_LENGTH = 600;

/**
 * The main-deck list of a code against the card catalog of the deck's format,
 * cheapest first, or `null` when the code does not decode or the catalog does
 * not name every card (a partial list would pass for the whole deck).
 * Sideboard modules are not listed.
 */
export function funDeckCardList(deckCode: string, catalog: Map<number, DeckBuilderCardRecord>): FunDeckOpenCard[] | null {
  const definition = deckCode.length <= MAX_CODE_LENGTH ? decodeDeckDefinition(deckCode) : null;
  if (!definition) return null;
  const counts = extractMainDeckCardCounts(definition);
  if (!counts.length) return null;
  const empty = new Map<number, DeckBuilderCardRecord>();
  const cards: FunDeckOpenCard[] = [];
  for (const { dbfId, count } of counts) {
    const card = resolveDeckCard(dbfId, count, catalog, empty, null);
    if (!card) return null;
    cards.push({ id: card.id, name: card.name, cost: card.cost, count });
  }
  return cards.sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name, 'ru', { sensitivity: 'base' }));
}

/**
 * Adds `cards` to every fun deck, decoded against the catalog of the deck's
 * format (one catalog read per format). A deck the catalog cannot name has no
 * list and the page leaves it out of the server HTML; a catalog that fails
 * leaves every deck without one, and the selection itself still answers.
 */
export async function funDeckOpenCards<T extends { deckCode: string; format: string }>(
  decks: readonly T[], loadCardCatalog: FunDeckCardCatalogLoader,
): Promise<Array<T & { cards?: FunDeckOpenCard[] }>> {
  const indexes = new Map<Format, Promise<Map<number, DeckBuilderCardRecord> | null>>();
  const indexOf = (format: Format) => {
    let index = indexes.get(format);
    if (!index) {
      index = loadCardCatalog(format).then(({ cards }) => (Array.isArray(cards) && cards.length ? indexCardsByDbf(cards as DeckBuilderCardRecord[]) : null), () => null);
      indexes.set(format, index);
    }
    return index;
  };
  return Promise.all(decks.map(async deck => {
    const index = await indexOf(deck.format.toLowerCase() === 'wild' ? 'wild' : 'standard');
    const cards = index ? funDeckCardList(deck.deckCode, index) : null;
    return cards ? { ...deck, cards } : deck;
  }));
}
