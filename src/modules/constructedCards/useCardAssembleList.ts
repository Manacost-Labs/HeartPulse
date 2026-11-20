'use client';
import { useEffect, useState } from 'react';
import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';
import { isAssembleList } from './model/assemblePage';
import type { CardAssembleListData } from './model/cardAssemble';

export type CardAssembleListState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: CardAssembleListData }
  | { status: 'error'; data: null };

/**
 * The cards of the tool. The server seeds `initial` when it read the list in time; otherwise the
 * browser asks `/api/card-assemble/:format`. A new `reload` retries after an error.
 */
export function useCardAssembleList(format: CardAssembleListData['format'], initial: CardAssembleListData | null, reload = 0): CardAssembleListState {
  const [state, setState] = useState<CardAssembleListState>(initial ? { status: 'ready', data: initial } : { status: 'loading', data: null });
  useEffect(() => {
    if (initial && reload === 0) return undefined;
    const controller = new AbortController();
    setState({ status: 'loading', data: null });
    fetchWithDeadline(`/api/card-assemble/${format}`, { signal: controller.signal, deadlineMs: 15_000, headers: { Accept: 'application/json' } })
      .then(async response => {
        const data: unknown = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;
        setState(isAssembleList(data, format) ? { status: 'ready', data } : { status: 'error', data: null });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', data: null }); });
    return () => controller.abort();
  }, [format, initial, reload]);
  return state;
}
