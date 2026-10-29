import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { DEFAULT_FUN_DECKS_VIEW, funDecksFiltered, type FunDecksView } from './funDecksPreview';
import { readFunDecksQuery, writeFunDecksQuery } from './funDecksQuery';
import { FUN_DECKS_FIRST_PAGE } from './FunDecksSkeleton';

export type FunDecksFilters = Omit<FunDecksView, 'query'>;

/**
 * The reader's filters, sort and search, and how many decks are shown. The
 * filters and the sort are kept in the address: read once the page is in the
 * browser (the server rendered the defaults), written on every change.
 */
export function useFunDecksFilters() {
  const [filters, setFilters] = useState<FunDecksFilters>(DEFAULT_FUN_DECKS_VIEW);
  const [query, setQuery] = useState('');
  const [urlRead, setUrlRead] = useState(false);
  const [visibleCount, setVisibleCount] = useState(FUN_DECKS_FIRST_PAGE);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setFilters(readFunDecksQuery(window.location.search));
    setUrlRead(true);
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
    setVisibleCount(FUN_DECKS_FIRST_PAGE);
  };
  const search = (text: string) => {
    setQuery(text);
    setVisibleCount(FUN_DECKS_FIRST_PAGE);
  };
  return {
    filters, query, view, visibleCount,
    filtered: funDecksFiltered(view),
    change, search,
    reset: () => {
      change({ format: 'all', classes: [], tags: [] });
      setQuery('');
    },
    showMore: () => setVisibleCount(count => count + FUN_DECKS_FIRST_PAGE),
  };
}
