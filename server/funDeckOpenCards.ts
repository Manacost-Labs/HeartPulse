import {
  decodeDeckDefinition,
  extractMainDeckCardCounts,
  extractSideboardParts,
  indexCardsByDbf,
  indexCardsRuByDbf,
  resolveDeckCard,
  type DeckBuilderCardRecord,
} from './deckBuilderResolve.js';

type Format = 'standard' | 'wild';
type Index = Map<number, DeckBuilderCardRecord>;

/**
 * One line of a fun deck's card list. `hasPage`: the card is in the format's
 * catalog, so `/standard/cards/<format>/<id>/` exists. A card the catalog lacks
 * (a companion of a Fabled legendary, say) is named from the full card
 * dictionary and listed without a link; `name: null` (and `id: null`) is a card
 * no dictionary knows: it keeps its place and count.
 */
export type FunDeckOpenCard = { id: string | null; name: string | null; cost: number | null; count: number; hasPage: boolean };

/**
 * The cards that travel with a main-deck card (the E.T.C. band, Zilliax's
 * modules), as the deck code carries them. `keyId` is that card's id in the
 * main list. Only cards a catalog or dictionary names are listed, as
 * `/api/deck/resolve` lists them, so the full list that replaces this one in
 * the browser has the same lines.
 */
export type FunDeckOpenSideboard = { keyId: string; cards: FunDeckOpenCard[] };

export type FunDeckOpenCardsDependencies = {
  loadCardCatalog: (format: Format) => Promise<{ cards: Record<string, unknown>[] }>;
  /** Card dictionaries by id (HearthstoneJSON, then `cards_ru.json`): name the cards the catalog lacks. */
  loadCardDictionaries?: () => Promise<Record<string, unknown>[]>;
  onError?: (error: unknown) => void;
};

/** Deck codes carry at most a few hundred characters; a longer string is not one. */
const MAX_CODE_LENGTH = 600;
const dictionaryIndexes = new WeakMap<object, Index>();

function dictionaryIndex(dictionaries: Record<string, unknown>[]): Index {
  const merged: Index = new Map();
  for (const dictionary of [...dictionaries].reverse()) {
    let index = dictionaryIndexes.get(dictionary);
    if (!index) { index = indexCardsRuByDbf(dictionary); dictionaryIndexes.set(dictionary, index); }
    for (const [dbfId, card] of index) merged.set(dbfId, card);
  }
  return merged;
}

/**
 * The whole main-deck list of a code, cheapest first, or `null` when the code
 * does not decode. A card neither the catalog nor the dictionary names does not
 * drop the list. Sideboard modules are not listed.
 */
export function funDeckCardList(deckCode: string, catalog: Index, dictionary: Index): FunDeckOpenCard[] | null {
  const definition = deckCode.length <= MAX_CODE_LENGTH ? decodeDeckDefinition(deckCode) : null;
  if (!definition) return null;
  const cards = extractMainDeckCardCounts(definition).map(({ dbfId, count }): FunDeckOpenCard => {
    const card = resolveDeckCard(dbfId, count, catalog, dictionary, null);
    return card ? { id: card.id, name: card.name, cost: card.cost, count, hasPage: card.collectible }
      : { id: null, name: null, cost: null, count, hasPage: false };
  });
  if (!cards.length) return null;
  return cards.sort((left, right) => (left.cost ?? 99) - (right.cost ?? 99) || (left.name ?? '').localeCompare(right.name ?? '', 'ru'));
}

/** The sideboards of a code that decodes, each under a key card the main list names; empty when it has none. */
export function funDeckSideboards(deckCode: string, catalog: Index, dictionary: Index): FunDeckOpenSideboard[] {
  const definition = deckCode.length <= MAX_CODE_LENGTH ? decodeDeckDefinition(deckCode) : null;
  if (!definition) return [];
  return extractSideboardParts(definition).flatMap(part => {
    const key = resolveDeckCard(part.keyCardDbfId, 1, catalog, dictionary, null);
    const cards = part.cards.flatMap(({ dbfId, count }): FunDeckOpenCard[] => {
      const card = resolveDeckCard(dbfId, count, catalog, dictionary, null, part.keyCardDbfId);
      return card ? [{ id: card.id, name: card.name, cost: card.cost, count, hasPage: card.collectible }] : [];
    });
    return key && cards.length ? [{ keyId: key.id, cards }] : [];
  });
}

/**
 * Adds `cards` (and `sideboards`, when the code has any) to every fun deck. A deck is never dropped: one whose code does
 * not decode, or read while no catalog has ever answered, keeps its code and
 * goes without a list. A failed catalog read serves the last good catalog of
 * that format; the dictionaries are optional (without them only the cards of
 * the catalog are named).
 */
export function createFunDeckOpenCards(dependencies: FunDeckOpenCardsDependencies) {
  const lastGood = new Map<Format, Index>();
  const catalogOf = async (format: Format): Promise<Index | null> => {
    try {
      const { cards } = await dependencies.loadCardCatalog(format);
      if (Array.isArray(cards) && cards.length) {
        const index = indexCardsByDbf(cards as DeckBuilderCardRecord[]);
        lastGood.set(format, index);
        return index;
      }
    } catch (error) {
      dependencies.onError?.(error);
    }
    return lastGood.get(format) ?? null;
  };
  const dictionaryOf = async (): Promise<Index> => {
    try {
      return dictionaryIndex(await dependencies.loadCardDictionaries?.() ?? []);
    } catch (error) {
      dependencies.onError?.(error);
      return new Map();
    }
  };
  return async function withCards<T extends { deckCode: string; format: string }>(decks: readonly T[]): Promise<Array<T & { cards?: FunDeckOpenCard[]; sideboards?: FunDeckOpenSideboard[] }>> {
    const catalogs = new Map<Format, Promise<Index | null>>();
    const dictionary = await dictionaryOf();
    return Promise.all(decks.map(async deck => {
      const format: Format = deck.format.toLowerCase() === 'wild' ? 'wild' : 'standard';
      if (!catalogs.has(format)) catalogs.set(format, catalogOf(format));
      const catalog = await catalogs.get(format);
      const cards = catalog ? funDeckCardList(deck.deckCode, catalog, dictionary) : null;
      if (!cards || !catalog) return deck;
      const sideboards = funDeckSideboards(deck.deckCode, catalog, dictionary);
      return sideboards.length ? { ...deck, cards, sideboards } : { ...deck, cards };
    }));
  };
}
