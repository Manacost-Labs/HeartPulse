import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { hsguruSourceUrl } from '@/apps/public-web/lib/seoDataSource';
import { seoStructuredDataGraph, type SeoStructuredDataFacts } from '@/src/seo/structuredData';

/** What the page's own data says about itself: the same projection the page prints, nothing more. */
export type SeoStructuredDataSource = { updatedAt?: string | null; sourceUrl?: string | null };

/**
 * JSON-LD of a page listed in `config/public-seo-structured-data.json`; renders nothing for other paths.
 * `data` is the public teaser the page shows: its update date becomes `dateModified`, and an HSGuru
 * `sourceUrl` becomes the address of the dataset's source. Without a readable date the graph has none.
 * `items` are the entries of the list the page prints in its server HTML (never more, never closed fields).
 */
export async function SeoStructuredData({ path, data, items }: {
  path: string; data?: SeoStructuredDataSource | null; items?: SeoStructuredDataFacts['items'];
}) {
  const date = seoDataDate(data?.updatedAt, Date.now());
  const graph = await seoStructuredDataGraph(path, { dateModified: date?.iso, sourceUrl: hsguruSourceUrl(data?.sourceUrl), items });
  if (!graph) return null;
  return <script type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}
