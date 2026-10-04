'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import PaywallPending from '@/src/components/PaywallPending';
import { hasAuthSessionHint } from '@/src/modules/identity/public';

// The paid Battlegrounds views, with their stylesheets, load only once the
// viewer may open them: a guest downloads the gate and nothing of the view.
// The server never renders them (access is unknown there), so `ssr: false`
// changes no HTML. Their loading state keeps the gate's reserved height.
export const loadBattlegrounds = () => import('@/src/features/Battlegrounds');
export const loadBgLibrary = () => import('@/src/features/BgLibrary');
const loading = () => <PaywallPending>Загружаем раздел…</PaywallPending>;

export const BattlegroundHeroesRoute = dynamic(() => loadBattlegrounds()
  .then(module => module.BattlegroundHeroesRoute), { ssr: false, loading });
export const BattlegroundTierList = dynamic(() => loadBattlegrounds()
  .then(module => module.BattlegroundTierList), { ssr: false, loading });
export const BattlegroundTierBuilderEmbed = dynamic(() => loadBattlegrounds()
  .then(module => module.BattlegroundTierBuilderEmbed), { ssr: false, loading });
export const BattlegroundStrategyBuilderEmbed = dynamic(() => loadBattlegrounds()
  .then(module => module.BattlegroundStrategyBuilderEmbed), { ssr: false, loading });
export const BgLibrary = dynamic(() => loadBgLibrary(), { ssr: false, loading });

/**
 * A remembered session is probably a subscriber's: start the view's download
 * while the access check runs, so it does not wait for the check to finish.
 * The hint grants nothing; the page still renders the view only when allowed.
 */
export function usePaidViewPrefetch(load: () => Promise<unknown>) {
  useEffect(() => {
    if (hasAuthSessionHint()) load().catch(() => { /* The view retries when it renders. */ });
  }, [load]);
}
