import 'server-only';
import { cache } from 'react';
import { catalogLocation, constructedCardCatalogUrl, type CardFormat } from '../../../src/modules/constructedCards/public';
import { publicCatalogSeed } from './publicCatalogSeed';

/** The upstream sees an anonymous request even when the page visitor is signed in. */
export const loadPublicCatalog = cache(async (format: CardFormat, search: string) => {
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') throw new Error('Invalid legacy origin');
  const state = catalogLocation(format, search);
  const url = new URL(constructedCardCatalogUrl({ ...state, query: state.filters.query }), origin);
  const response = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Public catalog temporarily unavailable');
  return publicCatalogSeed(await response.json(), format);
});
