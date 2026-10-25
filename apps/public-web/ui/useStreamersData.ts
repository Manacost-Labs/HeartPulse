'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { streamerFilterQuery, type StreamerFilters } from '@/src/modules/streamers/public';
import { fetchWithDeadline } from '@/src/shared/http/fetchWithDeadline';

type Page<F> = { total: number; offset: number; filters: F };

/**
 * Страница `/api/streamers…` с фильтрами и «Показать ещё». Первый ответ
 * приходит из HTML; без него, при смене фильтра и при повторе браузер
 * читает сам. `merge` дописывает следующую порцию к уже показанной.
 */
export function useStreamersData<F extends StreamerFilters, T extends Page<F>>({ path, defaults, initial, isPage, merge, shown }: {
  path: string;
  /** Фильтры, пока первого ответа нет. */
  defaults: F;
  initial: T | null;
  isPage: (value: unknown) => value is T;
  /** Показанная страница с дописанной следующей порцией. */
  merge: (shown: T, next: T) => T;
  /** Сколько строк уже показано: смещение следующей порции. */
  shown: (page: T) => number;
}) {
  const [page, setPage] = useState(initial);
  const [filters, setFilters] = useState<F>(initial?.filters ?? defaults);
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const first = useRef(Boolean(initial));

  const read = useCallback(async (query: string, signal: AbortSignal): Promise<T> => {
    const response = await fetchWithDeadline(`${path}${query}`, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!isPage(value)) throw new Error('Unexpected streamers response');
    return value;
  }, [path, isPage]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    read(streamerFilterQuery(filters), controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setPage(value);
      setFailed(false);
      setLoading(false);
    }, () => {
      if (controller.signal.aborted) return;
      setFailed(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [filters, attempt, read]);

  const more = useCallback(() => {
    if (!page || loadingMore) return;
    const current = page;
    setLoadingMore(true);
    read(streamerFilterQuery(filters, shown(current)), new AbortController().signal)
      .then(next => setPage(latest => (latest === current ? merge(current, next) : latest)), () => undefined)
      .finally(() => setLoadingMore(false));
  }, [page, loadingMore, filters, read, merge, shown]);

  return {
    page, filters, loading, loadingMore, failed,
    // Загрузка видна в том же кадре, что и нажатый фильтр: старые строки не выдают себя за новый срез.
    setFilters: (next: F) => { setLoading(true); setFilters(next); },
    more,
    retry: () => { setFailed(false); setAttempt(value => value + 1); },
  };
}
