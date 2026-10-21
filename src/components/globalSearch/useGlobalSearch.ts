import { useEffect, useState } from 'react';
import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';
import { MINIMUM_REMOTE_QUERY, type SearchArchetype, type SearchResponse } from './searchPaletteModel';

/** Typing pause before the remote search starts. */
const SEARCH_DEBOUNCE_MS = 220;
const ARCHETYPE_LIMIT = 5;
/** A search that does not answer in this time says so instead of spinning. */
const SEARCH_DEADLINE_MS = 10_000;

type RemoteResults = { search: SearchResponse | null; archetypes: SearchArchetype[] };

async function readArchetypes(query: string, signal: AbortSignal): Promise<SearchArchetype[]> {
  // The anonymous catalog teaser filters by name; a failure only hides the archetype group.
  const formats = ['standard', 'wild'] as const;
  const lists = await Promise.all(formats.map(format => fetchWithDeadline(
    `/api/constructed-archetypes/teaser?format=${format}&q=${encodeURIComponent(query)}`,
    { credentials: 'omit', signal, deadlineMs: SEARCH_DEADLINE_MS },
  ).then(response => response.ok ? response.json() : { items: [] }).catch(error => {
    if (error?.name === 'AbortError') throw error;
    return { items: [] };
  })));
  return lists.flatMap((list, index) => (Array.isArray(list?.items) ? list.items : [])
    .filter((item: SearchArchetype) => typeof item?.slug === 'string' && /^[a-z0-9-]{1,90}$/.test(item.slug))
    .map((item: SearchArchetype) => ({ ...item, format: formats[index] })))
    .slice(0, ARCHETYPE_LIMIT);
}

/**
 * Remote palette results for a query of two or more characters: articles and
 * cards from `/api/search`, archetypes from the public catalog teaser. Each
 * new query aborts the previous requests; the last results stay on screen
 * while the next ones load.
 */
export function useGlobalSearch(query: string) {
  const [results, setResults] = useState<RemoteResults>({ search: null, archetypes: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < MINIMUM_REMOTE_QUERY) {
      setResults({ search: null, archetypes: [] });
      setLoading(false);
      setError('');
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const search = fetchWithDeadline(`/api/search?q=${encodeURIComponent(normalizedQuery)}`, {
        signal: controller.signal,
        deadlineMs: SEARCH_DEADLINE_MS,
      }).then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Не удалось выполнить поиск');
        return data as SearchResponse;
      });
      void Promise.allSettled([search, readArchetypes(normalizedQuery, controller.signal)])
        .then(([searchResult, archetypeResult]) => {
          if (controller.signal.aborted) return;
          setResults({
            search: searchResult.status === 'fulfilled' ? searchResult.value : null,
            archetypes: archetypeResult.status === 'fulfilled' ? archetypeResult.value : [],
          });
          if (searchResult.status === 'rejected') setError(searchResult.reason?.message || 'Поиск временно недоступен');
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);
  return { results, loading, error };
}
