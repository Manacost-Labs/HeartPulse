import { constructedCardCatalogUrl, catalogLocation, type CardFormat } from '@/src/modules/constructedCards/public';
import { publicCatalogSeed } from './publicCatalogSeed';
import { fetchPublicExpress } from './expressApi';
import { CatalogUnavailableError, createDefaultCatalogCache } from './publicCatalogCache';

export function catalogRequest(format: CardFormat, search: string) {
  const state = catalogLocation(format, search);
  return constructedCardCatalogUrl({ ...state, query: state.filters.query });
}

export async function readCatalog(format: CardFormat, url: string, signal?: AbortSignal) {
  const response = await fetchPublicExpress(url, signal);
  if (!response.ok) throw new CatalogUnavailableError();
  return publicCatalogSeed(await response.json(), format);
}

type Catalog = Awaited<ReturnType<typeof readCatalog>>;

/**
 * The last good catalog is shown as the Express route does for its own: `dataStatus: 'stale'` and
 * a `warning`, which the page prints as its data notice. The stored copy stays `fresh`.
 */
export const STALE_CATALOG_WARNING = 'Источник данных временно недоступен. Показывается последняя проверенная версия каталога.';
export function markStaleCatalog(catalog: Catalog): Catalog {
  return { ...catalog, dataStatus: 'stale', warning: catalog.warning ?? STALE_CATALOG_WARNING };
}
const STORE_KEY = Symbol.for('hearthpulse.defaultCatalogStore');

/**
 * One store per Node process: `proxy.ts` and the pages are bundled apart, and
 * both must see the same last good catalogs, so it hangs off `globalThis`.
 * Keyed by format and normalized request, so a filtered or paged list falls
 * back to its own last good version as the default one does.
 */
export function cachedCatalog(format: CardFormat, search: string): Promise<Catalog> {
  const holder = globalThis as unknown as { [STORE_KEY]?: (key: string) => Promise<Catalog> };
  holder[STORE_KEY] ??= createDefaultCatalogCache<Catalog>((key, signal) => {
    const split = key.indexOf('|');
    return readCatalog(key.slice(0, split) as CardFormat, key.slice(split + 1), signal);
  }, Date.now, markStaleCatalog);
  return holder[STORE_KEY](`${format}|${catalogRequest(format, search)}`);
}
