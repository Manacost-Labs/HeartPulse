import { useContext, useEffect, useState } from 'react';
import { fetchGameStatsModes } from '../api/gameStatsApi';
import type { PlayerStatsMode } from '../model/stats';
import { GameStatsSourceContext } from './gameStatsSource';

/** `undefined` while checking, `null` when there is nothing to show, otherwise events per tab. */
export function useGameStatsModes(): Record<PlayerStatsMode, number> | null | undefined {
  const source = useContext(GameStatsSourceContext);
  const [modes, setModes] = useState<Record<PlayerStatsMode, number> | null | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    void fetchGameStatsModes(controller.signal, source).then(result => {
      if (!controller.signal.aborted) setModes(result);
    });
    return () => controller.abort();
  }, [source]);
  return modes;
}
