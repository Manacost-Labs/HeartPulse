import { type GuideTextRow, isGuideArchiveIndexable } from './excerpt.js';

type IndexabilityEntry = { signature: string; indexable: boolean };
const indexabilityCache = new Map<string, IndexabilityEntry>();

/**
 * The same predicate, remembered per slug while the text signature (lengths of the three text
 * columns) is unchanged. `loadText` runs only on a miss, so a repeat sitemap build never reads
 * or sanitizes the guide texts of an archive that is frozen.
 */
export function isGuideArchiveIndexableCached(
  slug: string, signature: string, loadText: () => GuideTextRow | undefined,
  cache: Map<string, IndexabilityEntry> = indexabilityCache,
): boolean {
  const known = cache.get(slug);
  if (known && known.signature === signature) return known.indexable;
  const row = loadText();
  const indexable = row ? isGuideArchiveIndexable(row) : false;
  if (row) cache.set(slug, { signature, indexable });
  return indexable;
}
