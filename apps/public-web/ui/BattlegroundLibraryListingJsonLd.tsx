import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicLibraryListing } from '@/apps/public-web/lib/publicBattlegroundLibraryListingData';
import { seoStructuredDataGraph, seoStructuredDataGraphOf } from '@/src/seo/structuredData';

const SITE = 'https://hearthpulse.net';
const PAYWALLED = { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-library' };

/**
 * JSON-LD of a library listing: its `ItemList` (the cards the HTML prints, never more), the closed part named for
 * crawlers (`isAccessibleForFree: false` + `hasPart` on `.paywalled-library`) and, for a listing with statistics, the
 * `Dataset` of the open base slice. A page of the registry gets its registered nodes; the others (the staged
 * listings) a `CollectionPage` built here from the same facts.
 */
export async function BattlegroundLibraryListingJsonLd({ path, heading, description, listing }: {
  path: string; heading: string; description: string; listing: PublicLibraryListing | null;
}) {
  const url = `${SITE}${path.replace(/\/?$/, '/')}`;
  const date = listing?.updatedAt ? seoDataDate(listing.updatedAt, Date.now()) : null;
  const facts = { dateModified: date?.iso, items: listing?.items.map(item => ({ name: item.name, url: `${SITE}${item.path}` })) };
  const graph = (await seoStructuredDataGraph(path, facts))
    ?? (await seoStructuredDataGraphOf(path, [{
      '@type': 'CollectionPage', '@id': `${url}#collection`, name: heading, description, url, inLanguage: 'ru',
    }], facts));
  if (!graph) return null;
  const nodes = graph['@graph'] as Array<Record<string, unknown>>;
  const collection = nodes.find(node => node['@type'] === 'CollectionPage');
  if (collection) Object.assign(collection, { isAccessibleForFree: false, hasPart: PAYWALLED });
  if (listing?.items.some(item => item.stats)) {
    nodes.push({
      '@type': 'Dataset', '@id': `${url}#dataset`, name: `Статистика существ Полей сражений Hearthstone`,
      description: 'Среднее место с существом и популярность в рейтинге «Топ 50%» текущего патча по данным HSReplay. Статистика по ходам, позиции на столе, покупки, история и узкие рейтинговые диапазоны доступны по подписке.',
      url, inLanguage: 'ru', isAccessibleForFree: false, hasPart: PAYWALLED,
      isBasedOn: [{ '@type': 'Dataset', name: 'HSReplay: Battlegrounds Minions', url: 'https://hsreplay.net/battlegrounds/minions/' }],
      variableMeasured: [
        { '@type': 'PropertyValue', name: 'Среднее место с существом' },
        { '@type': 'PropertyValue', name: 'Популярность', unitText: '%' },
      ],
      about: { '@type': 'VideoGame', name: 'Hearthstone' },
      ...(date ? { dateModified: date.iso } : {}),
    });
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}
