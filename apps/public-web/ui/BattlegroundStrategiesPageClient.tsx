'use client';

import PaywallGate from '../../../src/components/PaywallGate';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { BattlegroundStrategyBuilderEmbed } from '../../../src/features/Battlegrounds';
import { BattlegroundsStrategyBuilderSearchIntro } from '../../../src/modules/searchLanding/public';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const pathname = '/battlegrounds/strategies/';
const navigate = (path: string) => window.location.assign(path);

export function BattlegroundStrategiesPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'battlegrounds'));
  return <PublicPageShell activeTab="bg-strategies" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <BattlegroundStrategyBuilderEmbed key={access.user?.id} />
      : <section className="space-y-5">
        <BattlegroundsStrategyBuilderSearchIntro />
        {access.checking
          ? <p aria-busy="true">Проверяем доступ к конструктору стратегий...</p>
          : <PaywallGate active title="Конструктор стратегий доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
