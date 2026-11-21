import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { DEFAULT_FUN_DECKS_VIEW, funDecksFiltered, type FunDecksView } from './funDecksPreview';
import { readFunDecksQuery, writeFunDecksQuery } from './funDecksQuery';

export type FunDecksFilters = Omit<FunDecksView, 'query'>;

/**
 * The reader's filters, sort and search. The filters and the sort are kept in
 * the address and written on every change. `initial`: what the server read
 * from the address and rendered; without it (a story, a harness) the address
 * is read before the first paint.
 */
export function useFunDecksFilters(initial?: FunDecksFilters) {
  const [filters, setFilters] = useState<FunDecksFilters>(initial ?? DEFAULT_FUN_DECKS_VIEW);
  const [query, setQuery] = useState('');
  const [urlRead, setUrlRead] = useState(initial !== undefined);
  const deferredQuery = useDeferredValue(query);

  useLayoutEffect(() => {
    if (initial) return;
    setFilters(readFunDecksQuery(window.location.search));
    setUrlRead(true);
    // The address is read once, on mount.
  }, []);
  useEffect(() => {
    if (!urlRead) return;
    const search = writeFunDecksQuery(window.location.search, { ...filters, query: '' });
    if (search !== window.location.search) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [filters, urlRead]);

  const view: FunDecksView = useMemo(() => ({ ...filters, query: deferredQuery }), [filters, deferredQuery]);
  const change = (patch: Partial<FunDecksFilters>) => {
    setFilters(current => ({ ...current, ...patch }));
  };
  const search = (text: string) => {
    setQuery(text);
  };
  return {
    filters, query, view,
    filtered: funDecksFiltered(view),
    change, search,
    reset: () => {
      change({ format: 'all', classes: [], tags: [] });
      setQuery('');
    },
  };
}
