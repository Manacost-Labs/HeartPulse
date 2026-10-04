'use client';
import type { CatalogLocation } from './model/catalogLocation';
import { constructedCardCatalogUrl } from './model/catalogQuery';
import type { ConstructedCardPeriod, ConstructedCardRank } from './model/statisticsContext';

type CatalogPrefetch = (url: string, statsAccess: boolean) => Promise<void>;

/**
 * Warms the catalog slice a visitor points at in the rank or period menu, so
 * the switch they are about to make starts from an in-flight request.
 * Catalog responses are `no-store` and the warm cache lives only in this
 * document, so warming neighbours on every visit (three 120 KB requests and
 * up to a second of API time) paid off only for the few who changed a filter.
 * A format change loads a new document with a server-rendered catalog, so it
 * is never warmed.
 */
export function useCatalogIntentWarm(state: CatalogLocation, statsAccess: boolean, prefetch: CatalogPrefetch) {
  return (patch: { period?: ConstructedCardPeriod; rank?: ConstructedCardRank }) => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;
    void prefetch(constructedCardCatalogUrl({ ...state, ...patch, page: 1, query: state.filters.query }), statsAccess);
  };
}
