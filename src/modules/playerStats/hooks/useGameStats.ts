import { useEffect, useState } from 'react';
import { fetchGameStats } from '../api/gameStatsApi';
import type { PlayerStats, PlayerStatsQuery } from '../model/stats';

export type GameStatsState =
  | { status: 'loading'; stats: PlayerStats | null }
  | { status: 'ready'; stats: PlayerStats }
  | { status: 'error'; stats: PlayerStats | null; message: string };

/**
 * Loads one mode's statistics and reloads when a filter changes. The previous
 * answer stays on screen while the next one loads, so switching a filter does
 * not collapse the layout; a superseded request is aborted.
 */
export function useGameStats(query: PlayerStatsQuery, attempt = 0): GameStatsState {
  const [state, setState] = useState<GameStatsState>({ status: 'loading', stats: null });
  const { mode, period, duos, mmr } = query;
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ status: 'loading', stats: previous.stats?.mode === mode ? previous.stats : null }));
    fetchGameStats({ mode, period, duos, mmr }, controller.signal)
      .then(stats => setState({ status: 'ready', stats }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(previous => ({ status: 'error', stats: previous.stats,
          message: error instanceof Error ? error.message : 'Не удалось загрузить статистику' }));
      });
    return () => controller.abort();
  }, [mode, period, duos, mmr, attempt]);
  return state;
}
