'use client';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';
import { BattlegroundHeroesRoute, loadBattlegrounds, usePaidViewPrefetch } from './lazyBattlegrounds';
import { navigate } from './navigation';

export function BattlegroundHeroesPageClient() {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'battlegrounds'));
  return <PublicPageShell activeTab="bg-heroes" pathname="/heroes/"
    access={access} navigate={navigate} wide>
    <section className="space-y-5">
      <header className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Герои Полей сражений</h1>
          <p>Рейтинг героев для соло и дуо, фильтры по MMR и подробная статистика.</p>
        </div>
      </header>
      {allowed
        ? <BattlegroundHeroesRoute key={access.user?.id} path="/heroes/" onNavigate={navigate} />
        : access.checking
          ? <PaywallPending>Проверяем доступ к героям...</PaywallPending>
          : <PaywallGate active title="Герои Полей сражений доступны подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
    </section>
  </PublicPageShell>;
}
