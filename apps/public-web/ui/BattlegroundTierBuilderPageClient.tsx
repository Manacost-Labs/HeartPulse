'use client';

import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundTierBuilderEmbed, loadBattlegrounds, usePaidViewPrefetch } from './lazyBattlegrounds';
import { navigate } from './navigation';

const pathname = '/battlegrounds/tier-builder/';

export function BattlegroundTierBuilderPageClient() {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed, pending } = paidAccess(access, 'battlegrounds');
  return <PublicPageShell activeTab="bg-tier-builder" pathname={pathname}
    access={access} navigate={navigate} wide>
    <section className="space-y-5">
      <SectionBanner title="Конструктор тир-листов Полей сражений" />
      {allowed
        ? <BattlegroundTierBuilderEmbed key={access.user?.id} />
        : pending
          ? <PaywallPending>Проверяем доступ к конструктору тир-листов...</PaywallPending>
          : <PaywallGate active title="Конструктор тир-листов доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
    </section>
  </PublicPageShell>;
}
