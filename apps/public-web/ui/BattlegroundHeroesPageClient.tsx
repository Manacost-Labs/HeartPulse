'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundHeroesRoute, loadBattlegrounds, useBattlegroundsModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundHeroesOpenList } from './BattlegroundHeroesOpenList';
import type { PublicBattlegroundHeroesRanking } from '@/apps/public-web/lib/publicBattlegroundHeroesData';
import { navigate } from './navigation';

/**
 * Everyone without access (a guest, a robot, a signed-in visitor without a subscription) gets the
 * subscriber's ranking view on the open data `solo`/`duos`, rendered on the server; a subscriber gets
 * the same view on the live data of every rating range once its module is loaded.
 */
export function BattlegroundHeroesPageClient({ solo, duos }: {
  solo: PublicBattlegroundHeroesRanking | null; duos: PublicBattlegroundHeroesRanking | null;
}) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed } = paidAccess(access, 'battlegrounds');
  // The open ranking stays (with its height) until the paid view is loaded and can replace it in one render.
  const paidViewReady = useBattlegroundsModuleLoaded(allowed);
  return <PublicPageShell activeTab="bg-heroes" pathname="/heroes/"
    access={access} navigate={navigate} wide>
    <section className="space-y-5">
      <header className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Герои Полей сражений</h1>
          <p>Способности героев и тиры.</p>
          <div className="traditional-mode-banner__related">
            <a href="/battlegrounds/tier-list/">Тир-лист Полей сражений</a>
          </div>
        </div>
      </header>
      {allowed && paidViewReady
        ? <BattlegroundHeroesRoute key={access.user?.id} path="/heroes/" onNavigate={navigate} />
        : <BattlegroundHeroesOpenList solo={solo} duos={duos} onNavigate={navigate}
          paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
            subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />}
    </section>
  </PublicPageShell>;
}
