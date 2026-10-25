'use client';
import { useEffect, useState } from 'react';
import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';
import type { CardChoiceFormat, CardChoiceRank, CardChoicesData } from './model/cardChoices';

export type CardChoicesState =
  | { status: 'idle' | 'loading' | 'missing'; data: null; error: null }
  | { status: 'ready'; data: CardChoicesData; error: null }
  | { status: 'error'; data: null; error: string };

const IDLE: CardChoicesState = { status: 'idle', data: null, error: null };

/**
 * Pick statistics and the option pool of one card. `enabled` is false for cards
 * without a choice mechanic, so ordinary cards send no request. `missing` is a
 * 404: the card offers no choice the data source knows about.
 */
export function useCardChoices(format: CardChoiceFormat, cardId: string, rank: CardChoiceRank, enabled: boolean, reloadToken = 0) {
  const [state, setState] = useState<CardChoicesState>(enabled ? { status: 'loading', data: null, error: null } : IDLE);

  useEffect(() => {
    if (!enabled || !cardId) {
      setState(IDLE);
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });
    const url = `/api/card-choices/${format}/${encodeURIComponent(cardId)}?rank=${rank}`;
    fetchWithDeadline(url, { signal: controller.signal, deadlineMs: 15_000, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (response.status === 404) return setState({ status: 'missing', data: null, error: null });
        if (!response.ok) throw new Error('Статистика выбора временно недоступна.');
        const data = await response.json() as CardChoicesData;
        if (!controller.signal.aborted) setState({ status: 'ready', data, error: null });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', data: null, error: error instanceof Error ? error.message : 'Статистика выбора временно недоступна.' });
      });
    return () => controller.abort();
  }, [format, cardId, rank, enabled, reloadToken]);

  return state;
}
