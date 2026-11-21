import type { DeckListSideboard } from './decklist/DeckListView';
import type { FunDeckCard } from './funDecks/deckEntries';
import type { ArchetypeBuild, ArchetypeFormat, BuildSeed } from './archetypeBuildViews';

/** A card of an open build: what the server's open answer names (no statistics of the card). */
export type OpenBuildCard = {
  id: string | null; name: string | null; cost: number | null; rarity?: string | null; count: number; hasPage: boolean;
};
/** The cards that travel with `keyId`, a card of the build's list (the E.T.C. band, Zilliax's modules). */
export type OpenBuildSideboard = { keyId: string; cards: OpenBuildCard[] };
/**
 * A build of the open answer: its numbers, deck code, the card list (`null` when the cards could not be named) and
 * the sideboards of its code, when it has any.
 */
export type OpenBuild = {
  deckCode: string; games: number | null; winrate: number | null; updatedAt: string | null;
  sampleRank?: string; samplePeriod?: string; cards: OpenBuildCard[] | null; sideboards?: OpenBuildSideboard[];
};
/** An open build's lists in the shape of the deck views: what a gallery draws before (or instead of) the full list. */
export type OpenBuildSeed = BuildSeed;
/**
 * The open builds a page prints on the server: the first page, how many builds there are, where the next page
 * starts, and the reader of that next page (the app owns the request and its allowlist).
 */
export type OpenBuilds = {
  builds: OpenBuild[];
  total: number;
  next: number | null;
  loadMore?: (offset: number) => Promise<{ builds: OpenBuild[]; next: number | null }>;
};

export function openBuildAsBuild(build: OpenBuild): ArchetypeBuild {
  return {
    deckCode: build.deckCode, games: build.games, winrate: build.winrate, updatedAt: build.updatedAt,
    sampleRank: build.sampleRank ?? '', samplePeriod: build.samplePeriod ?? '', sourceUrl: '',
  };
}

/**
 * The subscriber's builds in the gallery a page already shows: each open build keeps its place and takes its paid
 * numbers, the paid builds the open page did not have (refused by the allowlist, or newer than the page's open copy)
 * follow them. An open build the paid answer lacks stays as it was. Nothing on screen moves or remounts.
 */
export function placePaidBuilds(open: readonly OpenBuild[], paid: readonly ArchetypeBuild[]): ArchetypeBuild[] {
  const byCode = new Map(paid.map(build => [build.deckCode, build]));
  const shown = new Set(open.map(build => build.deckCode));
  return [...open.map(build => byCode.get(build.deckCode) ?? openBuildAsBuild(build)), ...paid.filter(build => !shown.has(build.deckCode))];
}

/** Sideboard cards take ids after the main list's, so every card of the seed has its own key. */
const SIDEBOARD_IDS_FROM = 1_000;

function seedCard(card: OpenBuildCard, dbfId: number, format: ArchetypeFormat): FunDeckCard | null {
  if (!card.id || !card.name) return null;
  const rarity = card.rarity ?? 'COMMON';
  return {
    id: card.id, dbfId, name: card.name, cost: card.cost ?? 0, rarity, elite: rarity === 'LEGENDARY',
    count: card.count, image: '',
    pagePath: card.hasPage ? `/standard/cards/${format}/${encodeURIComponent(card.id)}/` : null,
  };
}

/**
 * The card list of an open build in the shape of the deck views, so a guest's gallery draws the same tiles as a
 * subscriber's without asking the server to resolve the code again. A card no dictionary names is left out.
 */
export function openBuildCards(build: OpenBuild, format: ArchetypeFormat): FunDeckCard[] | null {
  if (!build.cards) return null;
  const cards = build.cards.flatMap((card, index) => seedCard(card, index + 1, format) ?? []);
  return cards.length ? cards : null;
}

/**
 * An open build's list with its sideboards (the E.T.C. band, Zilliax's modules), each under its key card, so the
 * gallery draws from the server's HTML on the lines the full list will have: the full list that replaces it in a
 * subscriber's gallery adds none. `null`: the build has no list.
 */
export function openBuildSeed(build: OpenBuild, format: ArchetypeFormat): OpenBuildSeed | null {
  const cards = openBuildCards(build, format);
  if (!cards) return null;
  let next = SIDEBOARD_IDS_FROM;
  const sideboards = (build.sideboards ?? []).flatMap((board): DeckListSideboard[] => {
    const key = cards.find(card => card.id === board.keyId);
    const lines = board.cards.flatMap(card => seedCard(card, next++, format) ?? []);
    return key && lines.length ? [{ keyCardDbfId: key.dbfId, label: key.name, keyCard: key, cards: lines }] : [];
  });
  return { cards, sideboards };
}
