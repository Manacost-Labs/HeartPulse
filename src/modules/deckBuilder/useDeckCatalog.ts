import { useEffect, useState } from 'react';
import { loadDeckCatalog } from './api/client';
import type { BuilderCatalog, BuilderCatalogQuery, BuilderClass } from './model/selection';

export function useDeckCatalog(filters: BuilderCatalogQuery, load = loadDeckCatalog, guestClass: BuilderClass | null = null) {
  const [catalog, setCatalog] = useState<BuilderCatalog>({ cards: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      void load({ ...filters, guestClass: guestClass ?? undefined }, AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]))
        .then(result => { if (!controller.signal.aborted) setCatalog(result); })
        .catch(() => {
          if (!controller.signal.aborted) {
            setCatalog({ cards: [], total: 0, totalPages: 1 });
            setError('Не удалось загрузить карты. Попробуйте ещё раз.');
          }
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, filters.query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, load, reload, guestClass]);
  return { catalog, loading, error, retry: () => setReload(value => value + 1) };
}
