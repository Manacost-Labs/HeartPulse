'use client';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundHeroesRoute, loadBattlegrounds, usePaidViewPrefetch } from './lazyBattlegrounds';
import { navigate } from './navigation';

export function BattlegroundHeroesPageClient() {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed, pending } = paidAccess(access, 'battlegrounds');
  return <PublicPageShell activeTab="bg-heroes" pathname="/heroes/"
    access={access} navigate={navigate} wide>
    <section className="space-y-5">
      <header className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Герои Полей сражений</h1>
        </div>
      </header>
      {allowed
        ? <BattlegroundHeroesRoute key={access.user?.id} path="/heroes/" onNavigate={navigate} />
        : pending
          ? <PaywallPending>Проверяем доступ к героям...</PaywallPending>
          : <PaywallGate active title="Герои Полей сражений доступны подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
    </section>
  </PublicPageShell>;
}
