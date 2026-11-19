/**
 * Which Battlegrounds library card pages are offered to search engines
 * (docs/specs/seo-entity-indexing.md, «Порог индексации»).
 *
 * One pure rule for every reader of it: the Next.js card page puts it in its meta robots and JSON-LD, the
 * minion segment of the sitemap filters by it. It counts the facts the open slice of the page states about
 * the card (the name, type, tier, tribe, attack and health, the card text, every mechanic, the golden
 * version and the open figures of the base statistics slice) and applies the site-wide threshold of
 * `seoIndexThreshold.ts`. A page of one name and one line of text is a thin page and stays `noindex`.
 */
import { meetsContentThreshold } from './seoIndexThreshold.js';

/** What the open card page states about the card, as far as the rule reads it. */
export type LibraryIndexingFacts = {
  name: string | null;
  typeName: string | null;
  tavernTier: number | null;
  tribe: string | null;
  attack: number | null;
  health: number | null;
  text: string | null;
  mechanicCount: number;
  goldenAttack?: number | null;
  goldenHealth?: number | null;
  /** The open figures of the base statistics slice; `null` when the card has none (below the sample, not a minion). */
  stats?: {
    avgPlacementWith: number | null;
    avgPlacementWithout: number | null;
    popularity: number | null;
    gamesWith: number | null;
  } | null;
};

const present = (value: unknown): number => value !== null && value !== undefined && value !== '' ? 1 : 0;

/** The card's own facts: every field the open page prints as a number or a named value. */
export function countLibraryCardOwnFacts(facts: LibraryIndexingFacts): number {
  if (!present(facts.name)) return 0;
  const stats = facts.stats;
  return 1 + present(facts.typeName) + present(facts.tavernTier) + present(facts.tribe)
    + present(facts.attack) + present(facts.health) + present(facts.text)
    + Math.max(0, Math.floor(facts.mechanicCount))
    + present(facts.goldenAttack) + present(facts.goldenHealth)
    + (stats ? present(stats.avgPlacementWith) + present(stats.avgPlacementWithout)
      + present(stats.popularity) + present(stats.gamesWith) : 0);
}

/** Whether a library card page is indexable: its open facts must reach the content threshold. */
export function isIndexableBattlegroundLibraryCard(facts: LibraryIndexingFacts): boolean {
  return meetsContentThreshold({ ownWords: 0, ownFacts: countLibraryCardOwnFacts(facts) });
}
