import { useEffect, useState } from 'react';
import { fetchGameStats, gameStatsUrl } from '../api/gameStatsApi';
import type { PlayerStats, PlayerStatsQuery } from '../model/stats';

export type GameStatsState =
  | { status: 'loading'; stats: PlayerStats | null }
  | { status: 'ready'; stats: PlayerStats }
  | { status: 'error'; stats: PlayerStats | null; message: string };

type Loaded = { key: string; stats: PlayerStats } | null;

/**
 * Loads one mode's statistics and reloads when a filter changes. While the
 * next answer loads the previous one stays on screen, so a filter switch does
 * not collapse the layout; after a failure only an answer for the current
 * filters is shown, never one for other filters. A superseded request is aborted.
 */
export function useGameStats(query: PlayerStatsQuery, attempt = 0): GameStatsState {
  const { mode, period, duos, mmr } = query;
  const key = gameStatsUrl({ mode, period, duos, mmr });
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setFailure(null);
    fetchGameStats({ mode, period, duos, mmr }, controller.signal)
      .then(stats => setLoaded({ key, stats }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({ key, message: error instanceof Error ? error.message : 'Не удалось загрузить статистику' });
      });
    return () => controller.abort();
  }, [key, mode, period, duos, mmr, attempt]);

  if (failure?.key === key) return { status: 'error', stats: loaded?.key === key ? loaded.stats : null, message: failure.message };
  if (loaded?.key === key) return { status: 'ready', stats: loaded.stats };
  return { status: 'loading', stats: loaded?.stats.mode === mode ? loaded.stats : null };
}
