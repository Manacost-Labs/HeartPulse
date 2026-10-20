'use client';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { BattlegroundsStrategyBuilderSearchIntro } from '@/src/modules/searchLanding/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundStrategyBuilderEmbed, loadBattlegrounds, usePaidViewPrefetch } from './lazyBattlegrounds';
import { navigate } from './navigation';

const pathname = '/battlegrounds/strategies/';

export function BattlegroundStrategiesPageClient() {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed, pending } = paidAccess(access, 'battlegrounds');
  return <PublicPageShell activeTab="bg-strategies" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <BattlegroundStrategyBuilderEmbed key={access.user?.id} />
      : <section className="space-y-5">
        <BattlegroundsStrategyBuilderSearchIntro />
        {pending
          ? <PaywallPending>Проверяем доступ к конструктору стратегий...</PaywallPending>
          : <PaywallGate active title="Конструктор стратегий доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
