import { seoStructuredDataGraph } from '@/src/seo/structuredData';

/** JSON-LD of a page listed in `config/public-seo-structured-data.json`; renders nothing for other paths. */
export async function SeoStructuredData({ path }: { path: string }) {
  const graph = await seoStructuredDataGraph(path);
  if (!graph) return null;
  return <script type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}
