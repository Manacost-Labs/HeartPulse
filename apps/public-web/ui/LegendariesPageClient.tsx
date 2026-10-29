'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { Legendaries } from '@/src/features/DeferredRoutes';
import { useArenaLegendaries, type LegendariesData } from '@/src/modules/arenaLegendaries/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';

const EMPTY_DATA: LegendariesData = { groups: [], updatedAt: null, source: 'hsreplay.net' };

/** `children` is server-rendered content (the page's text) shown below the page, inside the shell's `<main>`. */
export function LegendariesPageClient({ children }: { children?: ReactNode }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'arena');
  const legendaries = useArenaLegendaries(access.user?.id, allowed);
  const data = legendaries.state.data ?? EMPTY_DATA;
  const [updatedAtLabel, setUpdatedAtLabel] = useState('Нет данных');
  useEffect(() => {
    setUpdatedAtLabel(data.updatedAt
      ? new Date(data.updatedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'Нет данных');
  }, [data.updatedAt]);

  return <PublicPageShell activeTab="legendaries" pathname="/legendaries/" parchmentPreload="tablet-up" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    <Legendaries data={data} loading={legendaries.loading || pending}
      error={legendaries.error} onRetry={legendaries.retry} legendarySource={legendaries.source}
      onLegendarySourceChange={legendaries.changeSource}
      switchingLegendarySource={legendaries.switching} onNavigate={navigateTab}
      authUser={access.user} subscriptionStatus={access.subscription}
      subscriptionLoading={pending} onRefreshSubscription={access.refresh}
      accessGranted={allowed} />
    {children}
  </PublicPageShell>;
}
