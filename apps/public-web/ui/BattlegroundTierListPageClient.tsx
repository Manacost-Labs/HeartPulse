'use client';

import PaywallGate from '../../../src/components/PaywallGate';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { BattlegroundTierList } from '../../../src/features/Battlegrounds';
import { BattlegroundsTierListSearchIntro } from '../../../src/modules/searchLanding/public';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const pathname = '/battlegrounds/tier-list/';
const navigate = (path: string) => window.location.assign(path);

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
          ? <p aria-busy="true">Проверяем доступ к тир-листу...</p>
          : <PaywallGate active title="Тир-лист БГ доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
