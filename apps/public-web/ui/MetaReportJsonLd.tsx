import { seoStructuredDataGraphOf, type SchemaNode, type SeoStructuredDataFacts } from '@/src/seo/structuredData';

/** JSON-LD of a meta report page; nothing while the page is not indexable (the graph builder refuses it). */
export async function MetaReportJsonLd({ path, nodes, facts }: { path: string; nodes: SchemaNode[]; facts: SeoStructuredDataFacts }) {
  const graph = await seoStructuredDataGraphOf(path, nodes, facts);
  if (!graph) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}
