import type { PublicLibraryListing } from '@/apps/public-web/lib/publicBattlegroundLibraryListingData';
import { seoStructuredDataGraph, seoStructuredDataGraphOf } from '@/src/seo/structuredData';
import { printedOpenLibraryItems } from '@/apps/public-web/lib/openBattlegroundLibrary';

const SITE = 'https://hearthpulse.net';
const PAYWALLED = { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-library' };

/**
 * JSON-LD of a library listing: its `ItemList` (the cards the HTML prints — the first page of the listing view, never
 * more) and the closed part named for crawlers (`isAccessibleForFree: false` + `hasPart` on `.paywalled-library`).
 * The listing view prints no statistics, so the page declares no `Dataset`. A page of the registry gets its registered
 * nodes; the others (the staged listings) a `CollectionPage` built here from the same facts.
 */
export async function BattlegroundLibraryListingJsonLd({ path, heading, description, listing }: {
  path: string; heading: string; description: string; listing: PublicLibraryListing | null;
}) {
  const url = `${SITE}${path.replace(/\/?$/, '/')}`;
  // The view prints no date of its data, so the page names none (`dateModified`).
  const facts = { items: listing ? printedOpenLibraryItems(listing).map(item => ({ name: item.name, url: `${SITE}${item.path}` })) : undefined };
  const graph = (await seoStructuredDataGraph(path, facts))
    ?? (await seoStructuredDataGraphOf(path, [{
      '@type': 'CollectionPage', '@id': `${url}#collection`, name: heading, description, url, inLanguage: 'ru',
    }], facts));
  if (!graph) return null;
  const nodes = graph['@graph'] as Array<Record<string, unknown>>;
  const collection = nodes.find(node => node['@type'] === 'CollectionPage');
  if (collection) Object.assign(collection, { isAccessibleForFree: false, hasPart: PAYWALLED });
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}
