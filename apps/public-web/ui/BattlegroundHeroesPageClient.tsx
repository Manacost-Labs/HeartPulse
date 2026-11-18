'use client';

import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundHeroesRoute, loadBattlegrounds, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundHeroesRangeLocks } from './BattlegroundHeroesRangeLocks';
import { navigate } from './navigation';

/**
 * `ranking` is the server-rendered open ranking: everyone without access sees it (a guest, a robot, a
 * signed-in visitor without a subscription), a subscriber has the interactive view in its place.
 */
export function BattlegroundHeroesPageClient({ ranking }: { ranking: ReactNode }) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed } = paidAccess(access, 'battlegrounds');
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
      {allowed
        ? <BattlegroundHeroesRoute key={access.user?.id} path="/heroes/" onNavigate={navigate} />
        : <>
          {ranking}
          {/* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */}
          <div className="paywalled-heroes" style={{ display: 'contents' }}>
            <BattlegroundHeroesRangeLocks authUser={access.user} subscriptionStatus={access.subscription}
              subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />
          </div>
        </>}
    </section>
  </PublicPageShell>;
}
