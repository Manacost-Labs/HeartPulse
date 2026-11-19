'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { BattlegroundsTierListSearchIntro } from '@/src/modules/searchLanding/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundTierList, loadBattlegrounds, useBattlegroundsModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundBuildsLocks } from './BattlegroundBuildsLocks';
import { navigate } from './navigation';

const pathname = '/battlegrounds/tier-list/';

/**
 * `builds` is the server-rendered open list: everyone without access sees it (a guest, a robot, a
 * signed-in visitor without a subscription), a subscriber has the interactive tier lists in its place.
 */
export function BattlegroundTierListPageClient({ builds }: { builds: ReactNode }) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed } = paidAccess(access, 'battlegrounds');
  // The open list stays (with its height) until the paid view is loaded and can replace it in one render.
  const paidViewReady = useBattlegroundsModuleLoaded(allowed);
  // The paid view is mounted (hidden) as soon as it may load, and tells when the list it really asked for came
  // back ok and not empty; only then does it replace the open list, so a failed protected read never does.
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
        : <>
          {/* The paid view brings its own banner: the intro (the page's H1) is only for the open list. */}
          <BattlegroundsTierListSearchIntro />
          {builds}
          {/* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */}
          <div className="paywalled-builds" style={{ display: 'contents' }}>
            <BattlegroundBuildsLocks authUser={access.user} subscriptionStatus={access.subscription}
              subscriptionLoading={access.checking} onRefreshSubscription={access.refresh}
              note="Статистика по узким рейтинговым диапазонам, разбор развилок по ходу партии и аксессуары — по подписке."
              title="Статистика по рейтинговым диапазонам и разбор развилок доступны подписчикам" />
          </div>
        </>}
    </section>
  </PublicPageShell>;
}
