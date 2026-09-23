'use client';
import { useEffect, useRef, useState } from 'react';
import type { CatalogLocation } from './model/catalogLocation';
import { constructedCardCatalogUrl } from './model/catalogQuery';

const SEARCH_REQUEST_DEBOUNCE_MS = 250;

type CatalogResponse<T> = { ok: boolean; status: number; payload: T };
type CatalogLoader<T> = (url: string, statsAccess: boolean, options: { bust?: boolean }) => Promise<CatalogResponse<T>>;

export function useCatalogData<T extends { statsAccess: boolean }>({ state, seed, statsAccess, load }: {
  state: CatalogLocation; seed?: T; statsAccess: boolean; load: CatalogLoader<T>;
}) {
  const [data, setData] = useState<T | null>(seed ?? null);
  const [loading, setLoading] = useState(!seed);
  const [error, setError] = useState<{ status: number } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [requestQuery, setRequestQuery] = useState(state.filters.query.trim());
  const firstRequest = useRef(true);
  const url = constructedCardCatalogUrl({ ...state, query: requestQuery });
  useEffect(() => {
    const timer = window.setTimeout(() => setRequestQuery(state.filters.query.trim()), state.filters.query ? SEARCH_REQUEST_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [state.filters.query]);
  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false;
      if (seed && !statsAccess) return;
    }
    let active = true;
    setLoading(true); setError(null);
    void load(url, statsAccess, { bust: reloadToken > 0 }).then(result => {
      if (!active) return;
      if (result.ok) setData(result.payload);
      else setError({ status: result.status });
    }).catch(() => { if (active) setError({ status: 0 }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url, statsAccess, reloadToken, load]);
  // A previous paid response must disappear as soon as access is lost.
  const visibleData = !statsAccess && data?.statsAccess ? null : data;
  return { data: visibleData, loading, error, requestQuery, retry: () => setReloadToken(value => value + 1) };
}
