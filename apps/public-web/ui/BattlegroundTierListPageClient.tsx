'use client';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { BattlegroundsTierListSearchIntro } from '@/src/modules/searchLanding/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundTierList, loadBattlegrounds, usePaidViewPrefetch } from './lazyBattlegrounds';
import { navigate } from './navigation';

const pathname = '/battlegrounds/tier-list/';

export function BattlegroundTierListPageClient() {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed, pending } = paidAccess(access, 'battlegrounds');
  return <PublicPageShell activeTab="bg-tier-list" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <BattlegroundTierList key={access.user?.id} />
      : <section className="space-y-5">
        <BattlegroundsTierListSearchIntro />
        {pending
          ? <PaywallPending>Проверяем доступ к тир-листу...</PaywallPending>
          : <PaywallGate active title="Тир-лист БГ доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
