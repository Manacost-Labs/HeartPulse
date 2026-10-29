/**
 * Which Constructed archetype pages are offered to search engines
 * (docs/specs/seo-entity-indexing.md, «Archetype pages»).
 *
 * One pure rule for every reader of it: the Next.js page puts it in its meta
 * robots and JSON-LD, the sitemap source of the Express server will ask the
 * same function. Wild is never indexed: its catalog is larger, mostly thin and
 * has no server-rendered path to the pages yet.
 */

/**
 * A winrate below this many games is noise, so the page stays out of the index.
 * Pilot value: it keeps about a third of the Standard catalog; tune it from
 * Search Console coverage, here and nowhere else.
 */
export const INDEXABLE_ARCHETYPE_MIN_GAMES = 1000;

/** What the rule reads from a catalog row or a detail answer of the public teaser. */
export type ArchetypeIndexingFacts = {
  format: string;
  games: number;
  deckCount: number;
  popularity: number | null;
};

function positive(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Whether an archetype page is indexable: Standard only, with a sample large
 * enough to read, at least one build (the paid part exists) and a share of the
 * games above zero (an archetype nobody plays is a placeholder).
 */
export function isIndexableArchetype(facts: ArchetypeIndexingFacts): boolean {
  return facts.format === 'standard'
    && Number.isFinite(facts.games) && facts.games >= INDEXABLE_ARCHETYPE_MIN_GAMES
    && positive(facts.deckCount)
    && positive(facts.popularity);
}
