import {
  decodeDeckDefinition,
  extractMainDeckCardCounts,
  indexCardsByDbf,
  resolveDeckCard,
  type DeckBuilderCardRecord,
} from './deckBuilderResolve.js';

/** Builds the open layer lists: the first page of the subscriber gallery. */
const OPEN_ARCHETYPE_BUILDS = 8;
const MAX_DECK_CODE_LENGTH = 600;
const NO_FALLBACK_CARDS = new Map<number, DeckBuilderCardRecord>();

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

/** One line of an open deck list; `id` names the card's page in the archetype's format. */
type OpenArchetypeCard = { id: string; name: string; cost: number; count: number };

/**
 * The main-deck list of a deck code, cheapest first, or `null` when the code
 * does not decode or a card is missing from the format's card catalog: a
 * partial list would pass for the whole deck. Sideboard modules are not listed.
 */
function openDeckCards(deckCode: string, catalog: Map<number, DeckBuilderCardRecord>): OpenArchetypeCard[] | null {
  const definition = deckCode.length <= MAX_DECK_CODE_LENGTH ? decodeDeckDefinition(deckCode) : null;
  if (!definition) return null;
  const cards: OpenArchetypeCard[] = [];
  for (const { dbfId, count } of extractMainDeckCardCounts(definition)) {
    const card = resolveDeckCard(dbfId, count, catalog, NO_FALLBACK_CARDS, null);
    if (!card) return null;
    cards.push({ id: card.id, name: card.name, cost: card.cost, count });
  }
  if (!cards.length) return null;
  return cards.sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name, 'ru'));
}

/**
 * The open layer of an archetype page (owner decision 2026-11-18, E21 OL5b):
 * the general slice and the first builds with their deck codes and card
 * lists, copied field by field. Matchups, card statistics (mulligan, kept,
 * drawn), history and the rank matrix have no input here, and a field a
 * source adds later stays out until it is named below. `catalogCards` is the
 * format's card catalog; without it the builds keep their codes and lose
 * only the card lists.
 */
export function publicArchetypeDetail(catalog: SourceCatalog, item: SourceItem, catalogCards: Record<string, unknown>[]) {
  const cardIndex = indexCardsByDbf(catalogCards as DeckBuilderCardRecord[]);
  const featured = item.builds[0];
  return {
    format: catalog.format, formatLabel: catalog.formatLabel, patch: catalog.patch,
    minimumGames: catalog.minimumGames, updatedAt: catalog.updatedAt,
    item: {
      slug: item.slug, archetype: item.archetype, archetypeLabel: item.archetypeLabel, translated: item.translated,
      classKey: item.classKey, format: item.format, games: item.games, winrate: item.winrate, popularity: item.popularity,
      turns: item.turns, durationMinutes: item.durationMinutes, climbingSpeed: item.climbingSpeed,
      deckCount: item.deckCount, sourceUrl: item.sourceUrl,
      builds: item.builds.slice(0, OPEN_ARCHETYPE_BUILDS).map(build => ({
        deckCode: build.deckCode, games: build.games, winrate: build.winrate, updatedAt: build.updatedAt,
        sampleRank: build.sampleRank, samplePeriod: build.samplePeriod, cards: openDeckCards(build.deckCode, cardIndex),
      })),
    },
    featuredBuild: featured ? {
      games: featured.games, winrate: featured.winrate, updatedAt: featured.updatedAt,
      sampleRank: featured.sampleRank, samplePeriod: featured.samplePeriod,
    } : null,
    history: [] as [], analysis: null,
  };
}
