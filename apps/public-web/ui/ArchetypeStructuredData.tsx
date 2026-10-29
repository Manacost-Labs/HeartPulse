import type { ArchetypeFamily } from '@/apps/public-web/lib/publicArchetypeRoute';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { hsguruSourceUrl } from '@/apps/public-web/lib/seoDataSource';
import { archetypeDetailSeoText, detailPeriodLabel } from '@/apps/public-web/lib/seoDataValues';
import { isIndexableArchetype } from '@/shared/constructedArchetypeIndexing';
import type { ArchetypeCatalog, ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import { archetypeStructuredDataGraph } from '@/src/seo/archetypeStructuredData';

/**
 * JSON-LD of an archetype page. Only an archetype that passes the indexing
 * rule gets one (the same rule as its meta robots); the legacy `meta` family is
 * noindex, so the graph builder refuses it. Built from the public teaser the
 * page shows, with the numbers as the teaser has them.
 */
export async function ArchetypeStructuredData({ detail, catalog, family }: {
  detail: ArchetypeDetail; catalog: ArchetypeCatalog | null; family: ArchetypeFamily;
}) {
  const { item } = detail;
  if (!isIndexableArchetype(item)) return null;
  const now = Date.now();
  const { title, description } = archetypeDetailSeoText(detail, now, catalog);
  const graph = await archetypeStructuredDataGraph({
    family, format: item.format, slug: item.slug, label: item.archetypeLabel, englishName: item.archetype,
    formatLabel: detail.formatLabel, period: detailPeriodLabel(detail), title, description,
    winrate: item.winrate, popularity: item.popularity, games: item.games,
    dateModified: seoDataDate(detail.updatedAt, now)?.iso, sourceUrl: hsguruSourceUrl(item.sourceUrl),
  });
  if (!graph) return null;
  return <script type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}
