import { createHash } from 'node:crypto';
import { archetypeIndexingFacts, canonicalSitemapOrigin, catalogDataDay } from './entitySitemapProjections.js';
import type { ArchetypeSitemapCatalog, ArchetypeSitemapSource } from './entitySitemapArchetypeSources.js';
import type { SitemapSemanticEntry } from './entitySitemapTypes.js';
import {
  classDeckArchetypes,
  DECK_CLASS_KEYS,
  isIndexableDeckClass,
  type DeckArchetypeFacts,
} from '../shared/deckClassIndexing.js';

// The `decks` segment (#650): the class pages of Standard decks, `/standard/decks/<class>/`, that pass the content
// threshold. The page and the segment read the same catalog and decide with the same two functions
// (`shared/deckClassIndexing.ts`); the hub `/standard/decks/` is a static page of `static.xml`.

type JsonRecord = Record<string, unknown>;

/** What the page prints of an archetype row of its class (and what the rule reads). */
type DeckClassArchetype = DeckArchetypeFacts & { slug: unknown; archetypeLabel: unknown };

/** One class page of the segment: the archetypes it lists, with the date and period of the catalog. */
export type DeckClassSitemapRow = {
  classKey: string;
  archetypes: DeckClassArchetype[];
  updatedAt: string | null;
  period: string | null;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function deckArchetype(item: unknown): DeckClassArchetype {
  const row = asRecord(item);
  return {
    ...archetypeIndexingFacts(item),
    classKey: typeof row.classKey === 'string' ? row.classKey : null,
    winrate: typeof row.winrate === 'number' && Number.isFinite(row.winrate) ? row.winrate : null,
    slug: row.slug ?? null,
    archetypeLabel: row.archetypeLabel ?? null,
  };
}

/**
 * The class pages of one catalog that pass `isIndexableDeckClass` over the archetypes `classDeckArchetypes` lists.
 * The catalog must be the Standard window the deck pages read (the teaser without a period: the first window of
 * `loadArchetypeCatalogWindows`); another format rejects the candidate.
 */
export function selectIndexableDeckClassRows(catalog: ArchetypeSitemapCatalog | undefined): DeckClassSitemapRow[] {
  if (!catalog || catalog.format !== 'standard' || !Array.isArray(catalog.items)) {
    throw new Error('Entity sitemap deck catalog is invalid');
  }
  const items = catalog.items.map(deckArchetype);
  return DECK_CLASS_KEYS.flatMap(classKey => {
    const archetypes = classDeckArchetypes(items, classKey);
    return isIndexableDeckClass(archetypes.length)
      ? [{ classKey, archetypes, updatedAt: catalog.updatedAt, period: catalog.period }]
      : [];
  });
}

/** The rows of `decks.xml` from the catalog windows of the archetype pages; a failing read keeps the last good segment. */
export async function loadIndexableDeckClassRows(source: ArchetypeSitemapSource): Promise<DeckClassSitemapRow[]> {
  const [catalog] = await source.loadCatalogs('standard');
  return selectIndexableDeckClassRows(catalog);
}

/**
 * Sitemap entries of the deck class pages, keyed by class. The rule is checked again: a row it keeps out is a wiring
 * mistake and rejects the whole candidate instead of listing a `noindex` page. The semantic hash covers what the
 * page prints of its archetypes (names, numbers, period), so `lastmod` takes the catalog's data day only when one of
 * them changed. Builds and deck codes are not read.
 */
export function projectDeckClassSitemapCatalog(rows: unknown[], originValue?: string): SitemapSemanticEntry[] {
  if (!Array.isArray(rows)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  return rows.map(raw => {
    const row = asRecord(raw);
    const classKey = typeof row.classKey === 'string' ? row.classKey : '';
    const archetypes = Array.isArray(row.archetypes) ? row.archetypes.map(deckArchetype) : [];
    if (!(DECK_CLASS_KEYS as readonly string[]).includes(classKey)
      || classDeckArchetypes(archetypes, classKey).length !== archetypes.length
      || !isIndexableDeckClass(archetypes.length)) {
      throw new Error('Deck sitemap catalog contains a class page that is not indexable');
    }
    const printed = archetypes.map(item => ({
      slug: item.slug, archetypeLabel: item.archetypeLabel, games: item.games, winrate: item.winrate, popularity: item.popularity,
    }));
    return {
      key: classKey,
      location: `${origin}/standard/decks/${classKey}/`,
      semanticHash: createHash('sha256').update(JSON.stringify({ classKey, period: row.period ?? null, printed })).digest('hex'),
      dataDate: catalogDataDay(row.updatedAt),
    };
  }).sort((left, right) => left.key.localeCompare(right.key, 'en'));
}
