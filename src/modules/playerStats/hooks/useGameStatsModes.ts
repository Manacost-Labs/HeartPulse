import { useContext, useEffect, useState } from 'react';
import { fetchGameStatsModes } from '../api/gameStatsApi';
import type { GameStatsModes } from '../model/stats';
import { GameStatsSourceContext } from './gameStatsSource';

/** `undefined` while checking, `null` when there is nothing to show, otherwise games per tab and Battlegrounds queue. */
export function useGameStatsModes(): GameStatsModes | null | undefined {
  const source = useContext(GameStatsSourceContext);
  const [modes, setModes] = useState<GameStatsModes | null | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    void fetchGameStatsModes(controller.signal, source).then(result => {
      if (!controller.signal.aborted) setModes(result);
    });
    return () => controller.abort();
  }, [source]);
  return modes;
}
