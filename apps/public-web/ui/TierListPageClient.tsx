'use client';

import { useEffect, useState } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { TierList } from '@/src/features/DeferredRoutes';
import { useArenaCompanionIds, useArenaTierList,
  type TierlistData } from '@/src/modules/arenaTierList/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';

const EMPTY_DATA: TierlistData = {
  sections: [], cards: {}, updatedAt: null, source: 'hsreplay',
};

export function TierListPageClient() {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'arena');
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

  return <PublicPageShell activeTab="tierlist" pathname="/tierlist/" parchmentPreload="tablet-up" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    <TierList data={data} loading={tierlist.loading || pending}
      error={tierlist.error} companionIds={companionIds}
      tierlistSource={tierlist.source} onTierlistSourceChange={tierlist.changeSource}
      switchingTierlistSource={tierlist.switching} onNavigate={navigateTab}
      authUser={access.user} subscriptionStatus={access.subscription}
      subscriptionLoading={pending} onRefreshSubscription={access.refresh}
      accessGranted={allowed} />
  </PublicPageShell>;
}
