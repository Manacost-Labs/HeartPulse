import { startTransition, useEffect, useState } from 'react';
import type { BattlegroundHeroMmr, BattlegroundHeroMode } from './model/heroCatalog';
import type { createBattlegroundHeroTierResource } from './model/heroTierResource';

type Resource = ReturnType<typeof createBattlegroundHeroTierResource>;

export function useBattlegroundHeroTierData(resource: Resource, mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr) {
  const key = `${mode}:${mmr}`;
  const [state, setState] = useState(() => ({ key, entry: resource.peek(mode, mmr), error: '' }));
  useEffect(() => resource.observe(mode, mmr, {
    onData: entry => startTransition(() => {
      setState(previous => previous.key === key && previous.entry === entry && !previous.error
        ? previous : { key, entry, error: '' });
    }),
    onError: error => setState(previous => ({
      key, entry: previous.key === key ? previous.entry : null,
      error: error instanceof Error ? error.message : 'Не удалось загрузить тир-лист героев',
    })),
  }), [resource, mode, mmr, key]);
  // A new filter must not briefly display the previous filter's cached rows.
  const current = state.key === key ? state : { key, entry: resource.peek(mode, mmr), error: '' };
  return {
    sections: current.entry?.sections ?? [],
    sourceLabel: current.entry?.sourceLabel ?? '',
    loading: !current.entry && !current.error,
    error: current.error,
  };
}
