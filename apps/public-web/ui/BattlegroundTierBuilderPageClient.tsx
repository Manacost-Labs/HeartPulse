'use client';

import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';
import { BattlegroundTierBuilderEmbed, loadBattlegrounds, usePaidViewPrefetch } from './lazyBattlegrounds';
import { navigate } from './navigation';

const pathname = '/battlegrounds/tier-builder/';

export function BattlegroundTierBuilderPageClient() {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'battlegrounds'));
  return <PublicPageShell activeTab="bg-tier-builder" pathname={pathname}
    access={access} navigate={navigate} wide>
    <section className="space-y-5">
      <SectionBanner title="Конструктор тир-листов Полей сражений" />
      {allowed
        ? <BattlegroundTierBuilderEmbed key={access.user?.id} />
        : access.checking
          ? <PaywallPending>Проверяем доступ к конструктору тир-листов...</PaywallPending>
          : <PaywallGate active title="Конструктор тир-листов доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
    </section>
  </PublicPageShell>;
}
