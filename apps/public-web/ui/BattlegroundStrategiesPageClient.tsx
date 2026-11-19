'use client';

import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { BattlegroundsStrategyBuilderSearchIntro } from '@/src/modules/searchLanding/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundStrategyBuilderEmbed, loadBattlegrounds, useBattlegroundsModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundBuildsLocks } from './BattlegroundBuildsLocks';
import { navigate } from './navigation';

const pathname = '/battlegrounds/strategies/';

/**
 * `builds` is the server-rendered open list of strategies: everyone without access sees it, a subscriber has
 * the strategy builder in its place once its chunk has loaded (the list keeps its height until then).
 */
export function BattlegroundStrategiesPageClient({ builds }: { builds: ReactNode }) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed } = paidAccess(access, 'battlegrounds');
  const paidViewReady = useBattlegroundsModuleLoaded(allowed);
  return <PublicPageShell activeTab="bg-strategies" pathname={pathname}
    access={access} navigate={navigate} wide>
    <section className="space-y-5">
      <BattlegroundsStrategyBuilderSearchIntro />
      {allowed && paidViewReady
        ? <BattlegroundStrategyBuilderEmbed key={access.user?.id} />
        : <>
          {builds}
          <div className="paywalled-builds" style={{ display: 'contents' }}>
            <BattlegroundBuildsLocks authUser={access.user} subscriptionStatus={access.subscription}
              subscriptionLoading={access.checking} onRefreshSubscription={access.refresh}
              note="Конструктор стратегий, статистика по узким рейтинговым диапазонам и разбор развилок — по подписке."
              title="Конструктор стратегий и разбор развилок доступны подписчикам" />
          </div>
        </>}
    </section>
  </PublicPageShell>;
}
