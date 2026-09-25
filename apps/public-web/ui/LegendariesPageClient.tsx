'use client';

import { useEffect, useState } from 'react';
import { NAVIGATION_ROUTES } from '../../../src/app/routing/navigationDefinitions';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { Legendaries } from '../../../src/features/DeferredRoutes';
import { useArenaLegendaries, type LegendariesData } from '../../../src/modules/arenaLegendaries/public';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const EMPTY_DATA: LegendariesData = { groups: [], updatedAt: null, source: 'hsreplay.net' };
const navigate = (path: string) => window.location.assign(path);
const navigateTab = (tab: string) => {
  const route = NAVIGATION_ROUTES.find(item => item.id === tab);
  if (!route) throw new Error('Unknown Arena destination');
  navigate(route.path);
};

export function LegendariesPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && hasSubscriptionEntitlement(access.subscription, 'arena');
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

  return <PublicPageShell activeTab="legendaries" pathname="/legendaries/" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    <Legendaries data={data} loading={legendaries.loading || access.checking}
      error={legendaries.error} legendarySource={legendaries.source}
      onLegendarySourceChange={legendaries.changeSource}
      switchingLegendarySource={legendaries.switching} onNavigate={navigateTab}
      authUser={access.user} subscriptionStatus={access.subscription}
      subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />
  </PublicPageShell>;
}
