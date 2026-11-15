import { constructedCardCatalogUrl, catalogLocation, type CardFormat } from '@/src/modules/constructedCards/public';
import { publicCatalogSeed } from './publicCatalogSeed';
import { fetchPublicExpress } from './expressApi';
import { CATALOG_READ_DEADLINE_MS, CatalogUnavailableError, createDefaultCatalogCache } from './publicCatalogCache';

export function catalogRequest(format: CardFormat, search: string) {
  const state = catalogLocation(format, search);
  return constructedCardCatalogUrl({ ...state, query: state.filters.query });
}

export async function readCatalog(format: CardFormat, url: string, signal?: AbortSignal) {
  const response = await fetchPublicExpress(url, signal, { timeoutMs: CATALOG_READ_DEADLINE_MS });
  if (!response.ok) throw new CatalogUnavailableError();
  return publicCatalogSeed(await response.json(), format);
}

type DefaultCatalog = ReturnType<typeof createDefaultCatalogCache<Awaited<ReturnType<typeof readCatalog>>>>;
const STORE_KEY = Symbol.for('hearthpulse.defaultCatalogStore');

/**
 * One store per Node process: `proxy.ts` and the pages are bundled apart, and
 * both must see the same last good catalog, so it hangs off `globalThis`.
 */
export function defaultCatalogStore(): DefaultCatalog {
  const holder = globalThis as unknown as { [STORE_KEY]?: DefaultCatalog };
  return holder[STORE_KEY] ??= createDefaultCatalogCache((format, signal) => readCatalog(format, catalogRequest(format, ''), signal));
}
