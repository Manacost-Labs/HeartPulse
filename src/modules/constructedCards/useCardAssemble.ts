'use client';
import { useEffect, useState } from 'react';
import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';
import type { CardAssembleData } from './model/cardAssemble';

export type CardAssembleState =
  | { status: 'idle' | 'loading' | 'missing'; data: null; error: null }
  | { status: 'ready'; data: CardAssembleData; error: null }
  | { status: 'error'; data: null; error: string };

const IDLE: CardAssembleState = { status: 'idle', data: null, error: null };

/**
 * «Сборка» statistics of one card. `base` is a base card's dbf id (its donors are
 * loaded) or `'top'` (the most offered base). `enabled` is false for cards without
 * Assemble, so ordinary cards send no request. `missing` is a 404: the data source
 * knows nothing about this card or base.
 */
export function useCardAssemble(format: CardAssembleData['format'], cardId: string, base: number | 'top', enabled: boolean, reloadToken = 0) {
  const [state, setState] = useState<CardAssembleState>(enabled ? { status: 'loading', data: null, error: null } : IDLE);

  useEffect(() => {
    if (!enabled || !cardId) {
      setState(IDLE);
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });
    const url = `/api/card-assemble/${format}/${encodeURIComponent(cardId)}?base=${base}`;
    fetchWithDeadline(url, { signal: controller.signal, deadlineMs: 15_000, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (response.status === 404) return setState({ status: 'missing', data: null, error: null });
        if (!response.ok) throw new Error('Статистика «Сборки» временно недоступна.');
        const data = await response.json() as CardAssembleData;
        if (!controller.signal.aborted) setState({ status: 'ready', data, error: null });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', data: null, error: error instanceof Error ? error.message : 'Статистика «Сборки» временно недоступна.' });
      });
    return () => controller.abort();
  }, [format, cardId, base, enabled, reloadToken]);

  return state;
}
