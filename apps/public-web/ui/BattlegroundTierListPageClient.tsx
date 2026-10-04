'use client';

import dynamic from 'next/dynamic';
import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { BattlegroundsTierListSearchIntro } from '@/src/modules/searchLanding/public';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

const pathname = '/battlegrounds/tier-list/';
const BattlegroundTierList = dynamic(() => import('@/src/features/Battlegrounds')
  .then(module => module.BattlegroundTierList), { ssr: false });

export function BattlegroundTierListPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'battlegrounds'));
  return <PublicPageShell activeTab="bg-tier-list" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <BattlegroundTierList key={access.user?.id} />
      : <section className="space-y-5">
        <BattlegroundsTierListSearchIntro />
        {access.checking
          ? <PaywallPending>Проверяем доступ к тир-листу...</PaywallPending>
          : <PaywallGate active title="Тир-лист БГ доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
