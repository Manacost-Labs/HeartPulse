import 'server-only';
import { cache } from 'react';
import { catalogLocation, constructedCardCatalogUrl, type CardFormat } from '@/src/modules/constructedCards/public';
import { publicCatalogSeed } from './publicCatalogSeed';
import { fetchPublicExpress } from './expressApi';
import { createDefaultCatalogCache } from './publicCatalogCache';

function catalogRequest(format: CardFormat, search: string) {
  const state = catalogLocation(format, search);
  return constructedCardCatalogUrl({ ...state, query: state.filters.query });
}

async function readCatalog(format: CardFormat, url: string, signal?: AbortSignal) {
  const response = await fetchPublicExpress(url, signal);
  if (!response.ok) throw new Error('Public catalog temporarily unavailable');
  return publicCatalogSeed(await response.json(), format);
}

const defaultCatalog = createDefaultCatalogCache((format, signal) => readCatalog(format, catalogRequest(format, ''), signal));

/** Anonymous default projections reuse a validated seed for 30s; arbitrary filters are never cached here. */
export const loadPublicCatalog = cache(async (format: CardFormat, search: string) => {
  const url = catalogRequest(format, search);
  return url === catalogRequest(format, '') ? defaultCatalog(format) : readCatalog(format, url);
});
