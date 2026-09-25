'use client';

import { useEffect, useState } from 'react';
import { NAVIGATION_ROUTES } from '../../../src/app/routing/navigationDefinitions';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { TierList } from '../../../src/features/DeferredRoutes';
import { useArenaCompanionIds, useArenaTierList,
  type TierlistData } from '../../../src/modules/arenaTierList/public';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const EMPTY_DATA: TierlistData = {
  sections: [], cards: {}, updatedAt: null, source: 'hsreplay',
};
const navigate = (path: string) => window.location.assign(path);
const navigateTab = (tab: string) => {
  const route = NAVIGATION_ROUTES.find(item => item.id === tab);
  if (!route) throw new Error('Unknown Arena destination');
  navigate(route.path);
};

export function TierListPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'arena'));
  const tierlist = useArenaTierList(access.user?.id, allowed);
  const companionIds = useArenaCompanionIds(access.user?.id, allowed && tierlist.source !== 'hsreplay');
  const data = tierlist.state.data ?? { ...EMPTY_DATA, source: tierlist.source };
  const [updatedAtLabel, setUpdatedAtLabel] = useState('Нет данных');
  useEffect(() => {
    setUpdatedAtLabel(data.updatedAt
      ? new Date(data.updatedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'Нет данных');
  }, [data.updatedAt]);

  return <PublicPageShell activeTab="tierlist" pathname="/tierlist/" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    <TierList data={data} loading={tierlist.loading || access.checking}
      error={tierlist.error} companionIds={companionIds}
      tierlistSource={tierlist.source} onTierlistSourceChange={tierlist.changeSource}
      switchingTierlistSource={tierlist.switching} onNavigate={navigateTab}
      authUser={access.user} subscriptionStatus={access.subscription}
      subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />
  </PublicPageShell>;
}
