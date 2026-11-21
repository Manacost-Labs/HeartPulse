import {
  decodeDeckDefinition,
  extractMainDeckCardCounts,
  extractSideboardParts,
  indexCardsByDbf,
  indexCardsRuByDbf,
  resolveDeckCard,
  type DeckBuilderCardRecord,
} from './deckBuilderResolve.js';

/** Builds per page of the open answer, as the subscriber gallery pages them (`BUILDS_PAGE`); `?buildsOffset=` reads the next. */
const OPEN_ARCHETYPE_BUILDS_PAGE = 8;
/** The card catalog only names the cards; past this wait the builds go out with their codes and `cards: null`. */
export const PUBLIC_CARD_CATALOG_DEADLINE_MS = 2_000;
/** An answer without some card list is not cached long: the list is back once the catalog answers again. */
export const DEGRADED_OPEN_ARCHETYPE_CACHE = 'public, max-age=30, stale-while-revalidate=30';
const MAX_DECK_CODE_LENGTH = 600;
const dictionaryIndexes = new WeakMap<object, Map<number, DeckBuilderCardRecord>>();

/**
 * The dictionaries indexed by dbf, the first naming a card winning; each index
 * is built once per dictionary object (the server keeps them until the file
 * changes or the 6-hour HearthstoneJSON copy is renewed).
 */
function dictionaryIndex(dictionaries: Record<string, unknown>[] | null): Map<number, DeckBuilderCardRecord> {
  const merged = new Map<number, DeckBuilderCardRecord>();
  for (const dictionary of [...(dictionaries ?? [])].reverse()) {
    let index = dictionaryIndexes.get(dictionary);
    if (!index) {
      index = indexCardsRuByDbf(dictionary);
      dictionaryIndexes.set(dictionary, index);
    }
    for (const [dbfId, card] of index) merged.set(dbfId, card);
  }
  return merged;
}

/** `load()` within `deadlineMs`, or `null` when it is missing, fails or does not answer in time. */
export async function withDeadline<T>(load: (() => Promise<T>) | undefined, deadlineMs: number, onError: (error: unknown) => void): Promise<T | null> {
  if (!load) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer in ${deadlineMs} ms`)), deadlineMs);
  });
  try {
    return await Promise.race([load(), deadline]);
  } catch (error) {
    onError(error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type SourceBuild = {
  deckCode: string; games: number | null; winrate: number | null; updatedAt: string | null;
  sampleRank: string; samplePeriod: string;
};
type SourceItem = {
  slug: string; archetype: string; archetypeLabel: string; translated: boolean; classKey: string | null;
  format: 'standard' | 'wild'; games: number; winrate: number | null; popularity: number | null; turns: number | null;
  durationMinutes: number | null; climbingSpeed: number | null; deckCount: number; sourceUrl: string; builds: SourceBuild[];
};
type SourceCatalog = { format: 'standard' | 'wild'; formatLabel: string; patch: string; minimumGames: number; updatedAt: string | null };

/**
 * One line of an open deck list. `hasPage`: the card is in the format's
 * catalog, so `/standard/cards/<format>/<id>/` exists; companion cards of a
 * Fabled legendary (Гарона, Броксигар…) are in the deck code but not in the
 * catalog and are listed by name only. `name: null` (and `id: null`) is a
 * card no dictionary knows: it keeps its place and count in the list.
 */
type OpenArchetypeCard = { id: string | null; name: string | null; cost: number | null; rarity: string | null; count: number; hasPage: boolean };

/**
 * The cards that travel with a main-deck card (the E.T.C. band, Zilliax's modules), as the deck code carries them,
 * under `keyId`, that card's id in the main list. Only the cards a catalog or dictionary names are listed, as
 * `/api/deck/resolve` lists them, so the full list that replaces the open one in a subscriber's gallery has the same
 * lines.
 */
type OpenArchetypeSideboard = { keyId: string; cards: OpenArchetypeCard[] };

/** Cheapest first, then by name: the order `/api/deck/resolve` lists a deck's cards in. */
const byCost = (left: OpenArchetypeCard, right: OpenArchetypeCard) => (left.cost ?? 99) - (right.cost ?? 99)
  || (left.name ?? '').localeCompare(right.name ?? '', 'ru');

function openCard(dbfId: number, count: number, catalog: Map<number, DeckBuilderCardRecord>,
  dictionary: Map<number, DeckBuilderCardRecord>, keyCardDbfId: number | null = null): OpenArchetypeCard | null {
  const card = resolveDeckCard(dbfId, count, catalog, dictionary, null, keyCardDbfId);
  return card ? { id: card.id, name: card.name, cost: card.cost, rarity: card.rarity, count, hasPage: card.collectible } : null;
}

/**
 * The whole main-deck list of a deck code and its sideboards, cheapest first, or `null` when the code does not
 * decode. Cards are named as the deck builder names them: the format's catalog first, then the full card dictionary;
 * a card neither knows does not drop the list. A sideboard is listed only under a key card of the main list.
 */
function openDeckLists(deckCode: string, catalog: Map<number, DeckBuilderCardRecord>, dictionary: Map<number, DeckBuilderCardRecord>):
  { cards: OpenArchetypeCard[]; sideboards: OpenArchetypeSideboard[] } | null {
  const definition = deckCode.length <= MAX_DECK_CODE_LENGTH ? decodeDeckDefinition(deckCode) : null;
  if (!definition) return null;
  const main = extractMainDeckCardCounts(definition);
  const cards = main.map(({ dbfId, count }): OpenArchetypeCard => openCard(dbfId, count, catalog, dictionary)
    ?? { id: null, name: null, cost: null, rarity: null, count, hasPage: false });
  if (!cards.length) return null;
  const sideboards = extractSideboardParts(definition).flatMap(part => {
    const key = main.some(({ dbfId }) => dbfId === part.keyCardDbfId) ? openCard(part.keyCardDbfId, 1, catalog, dictionary) : null;
    const lines = part.cards.flatMap(({ dbfId, count }) => openCard(dbfId, count, catalog, dictionary, part.keyCardDbfId) ?? []);
    return key && lines.length ? [{ keyId: key.id as string, cards: lines.sort(byCost) }] : [];
  });
  return { cards: cards.sort(byCost), sideboards };
}

/** A build's open card list (`cards: null` when it cannot be named) and, when its code has any, its sideboards. */
function openBuildLists(deckCode: string, catalog: Map<number, DeckBuilderCardRecord> | null, dictionary: Map<number, DeckBuilderCardRecord>) {
  const lists = catalog ? openDeckLists(deckCode, catalog, dictionary) : null;
  if (!lists) return { cards: null };
  return lists.sideboards.length ? { cards: lists.cards, sideboards: lists.sideboards } : { cards: lists.cards };
}

/** `?buildsOffset=`: absent is 0; anything but a whole number up to 10 000 is `null` (rejected). */
export function readBuildsOffset(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === 'string' && /^\d{1,5}$/.test(value) && Number(value) <= 10_000 ? Number(value) : null;
}

/**
 * The format's card catalog within `deadlineMs`, or `null` when it fails,
 * is empty or does not answer in time: a stalled catalog never holds the page.
 */
export async function readPublicCardCatalog(
  load: ((format: 'standard' | 'wild') => Promise<{ cards: Record<string, unknown>[] }>) | undefined,
  format: 'standard' | 'wild', deadlineMs: number, onError: (error: unknown) => void,
): Promise<Record<string, unknown>[] | null> {
  const answer = await withDeadline(load && (() => load(format)), deadlineMs, onError);
  return Array.isArray(answer?.cards) && answer.cards.length ? answer.cards : null;
}

/**
 * The open layer of an archetype page (owner decision 2026-11-18, E21 OL5b):
 * the general slice and every build with its deck code, card list and sideboards, a page
 * of `OPEN_ARCHETYPE_BUILDS_PAGE` from `offset` at a time (an archetype lists
 * up to 200 builds), copied field by field. Matchups, card statistics (mulligan, kept,
 * drawn), history and the rank matrix have no input here, and a field a
 * source adds later stays out until it is named below. `catalogCards` is the
 * format's card catalog; without it (`null`) the builds keep their codes and
 * lose only the card lists; `dictionaries` name the cards it lacks.
 */
export function publicArchetypeDetail(catalog: SourceCatalog, item: SourceItem, catalogCards: Record<string, unknown>[] | null,
  offset = 0, dictionaries: Record<string, unknown>[] | null = null) {
  const cardIndex = catalogCards ? indexCardsByDbf(catalogCards as DeckBuilderCardRecord[]) : null;
  const dictionary = dictionaryIndex(dictionaries);
  const featured = item.builds[0];
  return {
    format: catalog.format, formatLabel: catalog.formatLabel, patch: catalog.patch,
    minimumGames: catalog.minimumGames, updatedAt: catalog.updatedAt,
    item: {
      slug: item.slug, archetype: item.archetype, archetypeLabel: item.archetypeLabel, translated: item.translated,
      classKey: item.classKey, format: item.format, games: item.games, winrate: item.winrate, popularity: item.popularity,
      turns: item.turns, durationMinutes: item.durationMinutes, climbingSpeed: item.climbingSpeed,
      deckCount: item.deckCount, sourceUrl: item.sourceUrl,
      builds: item.builds.slice(offset, offset + OPEN_ARCHETYPE_BUILDS_PAGE).map(build => ({
        deckCode: build.deckCode, games: build.games, winrate: build.winrate, updatedAt: build.updatedAt,
        sampleRank: build.sampleRank, samplePeriod: build.samplePeriod, ...openBuildLists(build.deckCode, cardIndex, dictionary),
      })),
    },
    // The next page starts where this one ends in the source list, whatever the page's reader refuses.
    buildsTotal: item.builds.length, buildsOffset: offset,
    nextOffset: offset + OPEN_ARCHETYPE_BUILDS_PAGE < item.builds.length ? offset + OPEN_ARCHETYPE_BUILDS_PAGE : null,
    featuredBuild: featured ? {
      games: featured.games, winrate: featured.winrate, updatedAt: featured.updatedAt,
      sampleRank: featured.sampleRank, samplePeriod: featured.samplePeriod,
    } : null,
    history: [] as [], analysis: null,
  };
}
