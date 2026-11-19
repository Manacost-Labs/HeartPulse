'use client';

import type { ReactNode } from 'react';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BgLibrary, loadBgLibrary, useBgLibraryModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundLibraryLocks } from './BattlegroundLibraryLocks';
import { navigate } from './navigation';

/**
 * `children` is the server-rendered open listing: everyone without access sees it (a guest, a robot, a signed-in
 * visitor without a subscription), a subscriber has the interactive view in its place once its chunk is loaded.
 * A page without an open listing (the archive) keeps the gate.
 */
export function BattlegroundLibraryPageClient({ pathname, heading, children }: {
  pathname: string; heading: string; description?: string; children?: ReactNode;
}) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBgLibrary);
  const { allowed, pending } = paidAccess(access, 'battlegrounds');
  // The open listing stays (with its height) until the paid view is loaded and can replace it in one render.
  const paidViewReady = useBgLibraryModuleLoaded(allowed);
  const open = children !== undefined;
  return <PublicPageShell activeTab="bg-library" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed && (!open || paidViewReady)
      ? <BgLibrary key={`${pathname}:${access.user?.id}`} currentPath={pathname} navigatePath={navigate} cacheScope={access.user ? String(access.user.id) : undefined} />
      : open
        ? <section className="space-y-5">
          <SectionBanner title={heading} />
          {children}
          {/* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */}
          <div className="paywalled-library" style={{ display: 'contents' }}>
            <BattlegroundLibraryLocks label="Фильтры, сравнение карт и статистика по ходам"
              offer="Фильтры, сравнение карт и статистика по ходам доступны подписчикам"
              authUser={access.user} subscriptionStatus={access.subscription}
              subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />
          </div>
        </section>
        : <section className="space-y-5">
          <SectionBanner title={heading} />
          {pending
            ? <PaywallPending>Проверяем доступ к библиотеке...</PaywallPending>
            : <PaywallGate active title="Библиотека Полей сражений доступна подписчикам"
              headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
              subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
        </section>}
  </PublicPageShell>;
}
