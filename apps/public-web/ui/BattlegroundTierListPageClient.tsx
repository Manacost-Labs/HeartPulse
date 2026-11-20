'use client';

import { useCallback, useState } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import type { PublicBattlegroundBuilds } from '@/apps/public-web/lib/publicBattlegroundBuildsData';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundTierList, loadBattlegrounds, useBattlegroundsModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundTierListOpenView } from './BattlegroundTierListOpenView';
import { navigate } from './navigation';

const pathname = '/battlegrounds/tier-list/';

/**
 * Everyone without access (a guest, a robot, a signed-in visitor without a subscription) gets the subscriber's
 * tier list on the open builds `compositions`, rendered on the server, with the closed lists locked in place;
 * a subscriber gets the same view on the protected lists once its module is loaded.
 */
export function BattlegroundTierListPageClient({ compositions }: { compositions: PublicBattlegroundBuilds | null }) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed } = paidAccess(access, 'battlegrounds');
  // The open view stays (with its height) until the paid view is loaded and can replace it in one render.
  const paidViewReady = useBattlegroundsModuleLoaded(allowed);
  // The paid view is mounted (hidden) as soon as it may load, and tells when the list it really asked for came
  // back ok and not empty; only then does it replace the open view, so a failed protected read never does.
  const [dataReady, setDataReady] = useState(false);
  const onDataReady = useCallback(() => setDataReady(true), []);
  return <PublicPageShell activeTab="bg-tier-list" pathname={pathname}
    access={access} navigate={navigate} wide>
    <section className="space-y-5">
      {allowed && paidViewReady
        ? <div hidden={!dataReady}><BattlegroundTierList key={access.user?.id} onDataReady={onDataReady} /></div>
        : null}
      {allowed && paidViewReady && dataReady
        ? null
        : <BattlegroundTierListOpenView compositions={compositions}
          paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
            subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />}
    </section>
  </PublicPageShell>;
}
