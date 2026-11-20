import type { FunDeckCard } from './funDecks/deckEntries';
import type { ArchetypeBuild, ArchetypeFormat } from './archetypeBuildViews';

/** A card of an open build: what the server's open answer names (no statistics of the card). */
export type OpenBuildCard = {
  id: string | null; name: string | null; cost: number | null; rarity?: string | null; count: number; hasPage: boolean;
};
/** A build of the open answer: its numbers, deck code and the card list (`null` when the cards could not be named). */
export type OpenBuild = {
  deckCode: string; games: number | null; winrate: number | null; updatedAt: string | null;
  sampleRank?: string; samplePeriod?: string; cards: OpenBuildCard[] | null;
};
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
 * The card list of an open build in the shape of the deck views, so a guest's gallery draws the same tiles as a
 * subscriber's without asking the server to resolve the code again. A card no dictionary names is left out.
 */
export function openBuildCards(build: OpenBuild, format: ArchetypeFormat): FunDeckCard[] | null {
  if (!build.cards) return null;
  const cards: FunDeckCard[] = [];
  build.cards.forEach((card, index) => {
    if (!card.id || !card.name) return;
    const rarity = card.rarity ?? 'COMMON';
    cards.push({
      id: card.id, dbfId: index + 1, name: card.name, cost: card.cost ?? 0, rarity, elite: rarity === 'LEGENDARY',
      count: card.count, image: '',
      pagePath: card.hasPage ? `/standard/cards/${format}/${encodeURIComponent(card.id)}/` : null,
    });
  });
  return cards.length ? cards : null;
}
