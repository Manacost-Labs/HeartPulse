'use client';

import FAQSection from '@/src/components/FAQSection';
import PaywallGate from '@/src/components/PaywallGate';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { ArenaClassesPage, ArenaClassesResults, useArenaClasses } from '@/src/modules/arenaClasses/public';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';

const ignoreUpdatedAt = (_value: string | null) => undefined;

export function ClassesPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'arena'));
  const { state, retry } = useArenaClasses(access.user?.id, allowed, ignoreUpdatedAt);
  const updatedAtLabel = state.data?.updatedAt
    ? new Date(state.data.updatedAt).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : 'Нет данных';

  return <PublicPageShell activeTab="winrates" pathname="/classes/" parchmentPreload={false} access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    <ArenaClassesPage onNavigate={navigateTab}>
      <PaywallGate active={!access.checking && !allowed}
        title="Подтвердите подписку Манакоста для доступа к классам"
        headingLevel="h2"
        authUser={access.user} subscriptionStatus={access.subscription}
        subscriptionLoading={access.checking} onRefreshSubscription={access.refresh}>
        <ArenaClassesResults onNavigate={navigateTab} state={state} onRetry={retry} />
      </PaywallGate>
      <FAQSection />
    </ArenaClassesPage>
  </PublicPageShell>;
}
