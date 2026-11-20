import '@/src/features/TraditionalModeBanner.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { sampleText, type DeckArchetype } from '@/apps/public-web/lib/classDecks';
import { seoStructuredDataGraphOf, type SchemaNode } from '@/src/seo/structuredData';

const SITE = 'https://hearthpulse.net';

/** The page banner of the site with the H1 and one line under it: date of the data · sample · source. */
export function DecksBanner({ title, updatedAt, rows }: { title: string; updatedAt: string | null; rows: readonly DeckArchetype[] }) {
  const date = seoDataDate(updatedAt, Date.now());
  return <section className="traditional-mode-banner">
    <div className="traditional-mode-banner__copy">
      <h1>{title}</h1>
      <p>
        {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time> · </> : null}
        {sampleText(rows)} · источник HSGuru
      </p>
    </div>
  </section>;
}

/**
 * JSON-LD of a deck page: `CollectionPage` with the `ItemList` of the archetypes it prints and a `BreadcrumbList`.
 * The graph builder writes nothing for a path that is not indexable, so the pages carry none until the route
 * inventory opens them to search engines.
 */
export async function DecksStructuredData({ path, name, crumbs, items, updatedAt }: {
  path: string; name: string; crumbs: readonly { name: string; path: string }[];
  items: readonly { name: string; url: string }[]; updatedAt: string | null;
}) {
  const nodes: SchemaNode[] = [
    { '@type': 'BreadcrumbList', itemListElement: [{ name: 'Главная', path: '' }, ...crumbs].map((crumb, index) => ({
      '@type': 'ListItem', position: index + 1, name: crumb.name, item: `${SITE}${crumb.path}`,
    })) },
    { '@type': 'CollectionPage', '@id': `${SITE}${path}#collection`, name, url: `${SITE}${path}` },
  ];
  const graph = await seoStructuredDataGraphOf(path, nodes, { dateModified: seoDataDate(updatedAt, Date.now())?.iso, items });
  if (!graph) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}
