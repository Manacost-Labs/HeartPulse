'use client';

import type { ReactNode } from 'react';
import PaywallGate from '@/src/components/PaywallGate';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { ArenaClassesPage, ArenaClassesResults, useArenaClasses } from '@/src/modules/arenaClasses/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';

const ignoreUpdatedAt = (_value: string | null) => undefined;

/** `children` is server-rendered content (the page's text) shown below the page, inside the shell's `<main>`. */
export function ClassesPageClient({ children }: { children?: ReactNode }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'arena');
  const { state, retry } = useArenaClasses(access.user?.id, allowed, ignoreUpdatedAt);
  const updatedAtLabel = state.data?.updatedAt
    ? new Date(state.data.updatedAt).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : 'Нет данных';

  return <PublicPageShell activeTab="winrates" pathname="/classes/" parchmentPreload="tablet-up" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    <ArenaClassesPage onNavigate={navigateTab}>
      <PaywallGate active={!pending && !allowed}
        title="Подтвердите подписку Манакоста для доступа к классам"
        headingLevel="h2"
        authUser={access.user} subscriptionStatus={access.subscription}
        subscriptionLoading={access.checking} onRefreshSubscription={access.refresh}>
        <ArenaClassesResults state={state} onRetry={retry} />
      </PaywallGate>
    </ArenaClassesPage>
    {children}
  </PublicPageShell>;
}
