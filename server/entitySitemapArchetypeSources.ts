import {
  archetypeIndexingFacts,
  archetypePageSlug,
  type ArchetypeSitemapRow,
} from './entitySitemapProjections.js';
import { isIndexableArchetype } from '../shared/constructedArchetypeIndexing.js';

/** One window of the catalogs the archetype pages read (`loadArchetypeCatalogWindows`), as far as the sitemap reads it. */
export type ArchetypeSitemapCatalog = {
  format: string;
  period: string | null;
  updatedAt: string | null;
  items: unknown[];
};

export type ArchetypeSitemapFormat = 'standard' | 'wild';

export type ArchetypeSitemapSource = {
  loadCatalogs: (format: ArchetypeSitemapFormat) => Promise<ArchetypeSitemapCatalog[]>;
};

/**
 * The archetype rows of one format's catalog windows: those the page answers as
 * indexable. The page reads a slug from the first window of its format that
 * lists it, and the first row of that slug in it, so a slug is judged there
 * only: a later window or row with the same slug never enters the list,
 * whatever its numbers. Every window must be of `format`; a row of another
 * format is not a page of this format and is skipped.
 */
export function selectIndexableArchetypeRows(
  catalogs: ArchetypeSitemapCatalog[],
  format: ArchetypeSitemapFormat = 'standard',
): ArchetypeSitemapRow[] {
  if (!Array.isArray(catalogs) || catalogs.length === 0
    || catalogs.some(catalog => catalog?.format !== format || !Array.isArray(catalog.items))) {
    throw new Error('Entity sitemap archetype catalog is invalid');
  }
  const seen = new Set<string>();
  return catalogs.flatMap(catalog => catalog.items.flatMap(item => {
    const slug = archetypePageSlug(item);
    if (slug === null || seen.has(slug)) return [];
    seen.add(slug);
    const facts = archetypeIndexingFacts(item);
    return facts.format === format && isIndexableArchetype(facts)
      ? [{ item, updatedAt: catalog.updatedAt, period: catalog.period }]
      : [];
  }));
}

/**
 * The rows of `archetypes.xml`: Standard and Wild (#637), each judged in its own
 * windows, so one slug in both formats is two pages. Either format failing to
 * load rejects the whole candidate, and the last known good segment stays.
 */
export async function loadIndexableArchetypeRows(source: ArchetypeSitemapSource): Promise<ArchetypeSitemapRow[]> {
  const [standard, wild] = await Promise.all([source.loadCatalogs('standard'), source.loadCatalogs('wild')]);
  return [...selectIndexableArchetypeRows(standard, 'standard'), ...selectIndexableArchetypeRows(wild, 'wild')];
}
