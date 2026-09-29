import 'server-only';
import { cache } from 'react';
import { catalogLocation, constructedCardCatalogUrl, type CardFormat } from '@/src/modules/constructedCards/public';
import { publicCatalogSeed } from './publicCatalogSeed';
import { fetchPublicExpress } from './expressApi';

/** The upstream sees an anonymous request even when the page visitor is signed in. */
export const loadPublicCatalog = cache(async (format: CardFormat, search: string) => {
  const state = catalogLocation(format, search);
  const response = await fetchPublicExpress(constructedCardCatalogUrl({ ...state, query: state.filters.query }));
  if (!response.ok) throw new Error('Public catalog temporarily unavailable');
  return publicCatalogSeed(await response.json(), format);
});
