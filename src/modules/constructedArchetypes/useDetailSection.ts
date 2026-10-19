'use client';
import { useEffect, useEffectEvent, useState } from 'react';
import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';

type ReadState<T> = { key: string; data: T | null; error: string };

export function useDetailSection<T>(url: string, enabled: boolean, seed: T | null, onDenied: () => void) {
  const [revision, setRevision] = useState(0);
  const [forcedUrl, setForcedUrl] = useState('');
  const [state, setState] = useState<ReadState<T>>({ key: seed ? `${url}:0` : '', data: seed, error: '' });
  const key = `${url}:${revision}`;
  const deny = useEffectEvent(onDenied);
  useEffect(() => {
    if (!enabled || state.key === key || (seed && forcedUrl !== url)) return;
    const controller = new AbortController();
    const signal = controller.signal;
    void (async () => {
      try {
        const response = await fetchWithDeadline(url, { deadlineMs: 25_000, credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel(); if (!controller.signal.aborted) deny(); throw new Error('Доступ изменился. Проверьте подписку.');
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Данные временно недоступны');
        if (!controller.signal.aborted) setState({ key, data, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, data: null,
          error: error instanceof Error ? error.message : 'Не удалось загрузить данные' });
      }
      finally { if (!controller.signal.aborted) setForcedUrl(''); }
    })();
    return () => controller.abort();
  }, [url, enabled, key, seed, forcedUrl, state.key]);
  return { data: enabled && state.key === key ? state.data ?? seed : seed,
    loading: enabled && !(seed && forcedUrl !== url) && state.key !== key, error: enabled && state.key === key ? state.error : '',
    retry: () => { setForcedUrl(url); setRevision(value => value + 1); } };
}
