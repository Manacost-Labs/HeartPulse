import { useEffect, useState } from 'react';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { datasetContractErrorMessage } from '../../shared/datasetEnvelope';
import type { StandardMetaPeriod } from '../../shared/standardMetaContract';
import { parseStandardMetaTrends, type StandardMetaTrends } from '../../shared/standardMetaTrendsContract';

export type StandardMetaTrendsQuery = {
  format: 'standard' | 'wild';
  rank: string;
  period: StandardMetaPeriod;
  minGames: number;
  /** Trends are a subscriber endpoint: without access nothing is requested. */
  loadTrends: boolean;
  /** Stories and tests hand the trends in instead of fetching them. */
  initialTrends?: StandardMetaTrends | null;
};

type TrendsState = { key: string; trends: StandardMetaTrends | null; error: string };

/** The slice's change against the previous window and its win rate over the rolling windows. */
export function useStandardMetaTrends({ format, rank, period, minGames, loadTrends, initialTrends }: StandardMetaTrendsQuery) {
  const key = `${format}:${rank}:${period}:${minGames}`;
  const [state, setState] = useState<TrendsState>({ key: initialTrends === undefined ? '' : key, trends: initialTrends ?? null, error: '' });
  useEffect(() => {
    if (!loadTrends || initialTrends !== undefined) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({ format, rank, period, coin: 'any_player', min_games: String(minGames) });
    fetchWithDeadline(`/api/standard-meta/trends?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('Динамика меты временно недоступна');
        return response.json();
      })
      .then(payload => setState({ key, trends: parseStandardMetaTrends(payload), error: '' }))
      .catch(cause => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setState({ key, trends: null, error: datasetContractErrorMessage(cause) });
      });
    return () => controller.abort();
  }, [format, rank, period, minGames, loadTrends, initialTrends, key]);
  return state.key === key ? state : { key, trends: null, error: '' };
}
