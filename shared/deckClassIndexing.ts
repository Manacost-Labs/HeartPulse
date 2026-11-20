/**
 * Which class pages of Standard decks (`/standard/decks/<class>/`) are offered
 * to search engines (docs/specs/seo-entity-indexing.md, «Колоды Стандарта»).
 *
 * One rule for every reader: the Next.js page lists `classDeckArchetypes` and
 * puts `isIndexableDeckClass` in its meta robots and JSON-LD; the `decks`
 * segment of the sitemap lists a class with the same two functions over the
 * same catalog.
 */

import { isIndexableArchetype, type ArchetypeIndexingFacts } from './constructedArchetypeIndexing.js';
import { INDEX_MIN_OWN_FACTS, meetsContentThreshold } from './seoIndexThreshold.js';

/** The eleven classes of the deck pages, as the catalog keys them; any other key is a 404. */
export const DECK_CLASS_KEYS = [
  'deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior',
] as const;

/**
 * A class page lists at most this many archetypes: each row reads its archetype's build, so the page asks Express
 * for no more details than this. The live catalog has at most nine strong archetypes in a class.
 */
export const CLASS_DECKS_MAX_ARCHETYPES = 12;

/** Numbers a row of a class page states (winrate, popularity, games): the facts of the content threshold. */
const FACTS_PER_ARCHETYPE = 3;

/** Rows a class page needs to state `INDEX_MIN_OWN_FACTS` facts. */
export const CLASS_DECKS_MIN_ARCHETYPES = Math.ceil(INDEX_MIN_OWN_FACTS / FACTS_PER_ARCHETYPE);

/** What the rule reads of a catalog row. */
export type DeckArchetypeFacts = ArchetypeIndexingFacts & { classKey: string | null; winrate: number | null };

/**
 * The archetypes a class page lists: Standard rows of the class that pass `isIndexableArchetype` (the rule of their
 * own pages), best winrate first, the larger sample breaking ties; at most `CLASS_DECKS_MAX_ARCHETYPES`.
 */
export function classDeckArchetypes<T extends DeckArchetypeFacts>(items: readonly T[], classKey: string): T[] {
  return items
    .filter(item => item.format === 'standard' && item.classKey === classKey && isIndexableArchetype(item))
    .sort((left, right) => (right.winrate ?? -1) - (left.winrate ?? -1) || right.games - left.games)
    .slice(0, CLASS_DECKS_MAX_ARCHETYPES);
}

/** Whether a class page listing `archetypes` rows states enough facts to be indexed (`seoIndexThreshold.ts`). */
export const isIndexableDeckClass = (archetypes: number) =>
  meetsContentThreshold({ ownWords: 0, ownFacts: archetypes * FACTS_PER_ARCHETYPE });
