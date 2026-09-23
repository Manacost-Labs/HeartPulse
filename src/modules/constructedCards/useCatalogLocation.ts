'use client';
import { useEffect, useState } from 'react';
import { constructedCardRoute, type CardFormat } from './model/cardRoute';
import { catalogLocation, catalogLocationUrl, type CatalogLocation } from './model/catalogLocation';
import { EMPTY_CONSTRUCTED_CARD_FILTERS, type ConstructedCardCatalogFilters } from './model/catalogQuery';

export function useCatalogLocation(format: CardFormat, initialSearch?: string) {
  const [state, setState] = useState(() => catalogLocation(format, initialSearch ?? (typeof window === 'undefined' ? '' : window.location.search)));
  useEffect(() => {
    const sync = () => setState(catalogLocation(constructedCardRoute(window.location.pathname).format, window.location.search));
    // The legacy shell can switch format without remounting this component.
    setState(current => current.format === format ? current : catalogLocation(format, window.location.search));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [format]);
  const update = (patch: Partial<CatalogLocation>, replace = false) => {
    const next = { ...state, ...patch };
    const url = catalogLocationUrl(window.location.pathname, next, window.location.search);
    if (url !== window.location.pathname + window.location.search) {
      window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', url);
    }
    setState(next);
  };
  const updateFilter = (key: keyof ConstructedCardCatalogFilters, value: string) => update({
    filters: { ...state.filters, [key]: value.slice(0, 120) }, page: 1,
  }, key === 'query');
  return {
    state, update, updateFilter,
    clearSearch: () => update({ filters: { ...state.filters, query: '' }, page: 1 }),
    reset: () => update({ filters: { ...EMPTY_CONSTRUCTED_CARD_FILTERS }, period: '1d', page: 1 }),
  };
}
