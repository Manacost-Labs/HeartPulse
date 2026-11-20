import { useEffect, useRef, useState } from 'react';
import type { BattlegroundTierListKey } from '../modules/battlegrounds/public';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';

/**
 * Where the tier list reads a slice, by its request (`bgTierListRequest`). `peek` answers with a slice that
 * is already in the page, so a server-rendered view has its data in the first render; `load` reads one.
 */
export type BattlegroundTierListSource = {
  peek: (request: string) => any | null;
  load: (request: string) => Promise<any>;
  /** A slice already known to be unavailable: the view starts with this error (the server render too). */
  unavailable?: (request: string) => string | null;
};

const FAILED = 'Не удалось загрузить BG тир-лист';

/** The subscriber's source: the protected tier lists and trinket statistics. */
export const liveBattlegroundTierListSource: BattlegroundTierListSource = {
  peek: () => null,
  load: async request => {
    const response = await fetchWithDeadline(request);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || FAILED);
    return payload;
  },
};

/** Whether a tier-list answer has anything to show (a list with at least one entry). */
export const hasTierEntries = (payload: any): boolean => Object.values(payload?.tiers ?? {}).some(items => Array.isArray(items) && items.length > 0);

/**
 * The slice `request` of the list `list` from `source`: a slice read before (or in the page) shows at once and is
 * read again in the background; a different list's answer is an error. `attempt` repeats a failed read.
 */
export function useBattlegroundTierListData(source: BattlegroundTierListSource, request: string, list: BattlegroundTierListKey, attempt: number) {
  const [data, setData] = useState<any | null>(() => source.peek(request));
  const [error, setError] = useState(() => source.unavailable?.(request) ?? '');
  const [loading, setLoading] = useState(() => source.peek(request) === null && !error);
  const cacheRef = useRef<Record<string, any>>({});
  const requestRef = useRef('');

  useEffect(() => {
    let alive = true;
    const current = () => alive && requestRef.current === request;
    setError('');
    requestRef.current = request;
    const cached = cacheRef.current[request] ?? source.peek(request);
    if (cached && (!cached?.list || cached.list === list)) {
      setData(cached);
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }
    source.load(request)
      .then(payload => {
        if (payload?.list && payload.list !== list) throw new Error('API вернул данные другого раздела');
        cacheRef.current[request] = payload;
        if (current()) setData(payload);
      })
      .catch(err => {
        if (current()) setError(err?.message || FAILED);
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => { alive = false; };
  }, [attempt, list, request, source]);

  /** Drops the shown slice before the list changes, so the old list never shows under the new tab. */
  const reset = () => {
    setData(null);
    setLoading(true);
  };
  return { data, loading, error, reset };
}
