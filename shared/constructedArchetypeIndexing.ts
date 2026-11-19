/**
 * Which Constructed archetype pages are offered to search engines
 * (docs/specs/seo-entity-indexing.md, «Archetype pages»).
 *
 * One pure rule for every reader of it: the Next.js page puts it in its meta
 * robots and JSON-LD, the sitemap source of the Express server will ask the
 * same function. Wild is never indexed: its catalog is larger, mostly thin and
 * has no server-rendered path to the pages yet.
 */

import { INDEX_MIN_SAMPLE_GAMES, meetsSampleThreshold } from './seoIndexThreshold.js';

/**
 * A winrate below this many games is noise, so the page stays out of the index.
 * The number lives in `seoIndexThreshold.ts` (the one indexing threshold); this
 * is the name the archetype readers already use.
 */
export const INDEXABLE_ARCHETYPE_MIN_GAMES = INDEX_MIN_SAMPLE_GAMES.archetype;

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
    && meetsSampleThreshold(facts.games, INDEX_MIN_SAMPLE_GAMES.archetype)
    && positive(facts.deckCount)
    && positive(facts.popularity);
}
