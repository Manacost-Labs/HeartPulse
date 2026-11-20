'use client';

import { useMemo, type ReactNode } from 'react';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';

import PaywallGate, { type PaywallAccessState } from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { libraryKindOf, openLibraryCards, type OpenLibraryListing } from '@/apps/public-web/lib/openBattlegroundLibrary';
import type { LibraryListingKind } from '@/apps/public-web/lib/publicBattlegroundLibraryListingData';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BgLibrary, loadBgLibrary, loadBgLibraryCatalog, useBgLibraryModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundLibraryLocks } from './BattlegroundLibraryLocks';
import { BattlegroundLibraryOpenListing } from './BattlegroundLibraryOpenListing';
import { navigate } from './navigation';

/**
 * A listing page (`kind` and `listing`, `null` when the open listing is unavailable) renders the subscriber's listing
 * view for everyone, one instance throughout (`BattlegroundLibraryOpenListing`): on the open cards with the archive
 * locked for a viewer without access, on the protected catalog for a subscriber once it has arrived. `children` is the
 * server-rendered open hub; a page with neither (the archive) keeps the gate.
 */
export function BattlegroundLibraryPageClient({ pathname, heading, children, kind, listing }: {
  pathname: string; heading: string; description?: string; children?: ReactNode;
  kind?: LibraryListingKind; listing?: OpenLibraryListing | null;
}) {
  const access = usePublicAccess();
  usePaidViewPrefetch(kind === undefined ? loadBgLibrary : loadBgLibraryCatalog);
  const { allowed, pending } = paidAccess(access, 'battlegrounds');
  const cards = useMemo(() => listing ? openLibraryCards(listing) : null, [listing]);
  const open = children !== undefined;
  // The open hub stays (with its height) until the paid view is loaded and can replace it in one render.
  const paidViewReady = useBgLibraryModuleLoaded(allowed && kind === undefined);
  const paywall: PaywallAccessState = { authUser: access.user, subscriptionStatus: access.subscription,
    subscriptionLoading: access.checking, onRefreshSubscription: access.refresh };
  const cacheScope = access.user ? String(access.user.id) : undefined;
  return <PublicPageShell activeTab="bg-library" pathname={pathname}
    access={access} navigate={navigate} wide>
    {kind !== undefined
      ? <BattlegroundLibraryOpenListing kind={libraryKindOf(kind)} heading={heading} cards={cards} paywall={paywall}
        subscriber={allowed ? { cacheScope } : null} />
      : allowed && (!open || paidViewReady)
        ? <BgLibrary key={`${pathname}:${access.user?.id}`} currentPath={pathname} navigatePath={navigate}
          cacheScope={cacheScope} heading={heading} />
        : <LibraryHubOrGate heading={heading} pending={pending} paywall={paywall}>{children}</LibraryHubOrGate>}
  </PublicPageShell>;
}

/** The open hub with its locked part (`children`), or, for a page without an open part (the archive), the gate. */
function LibraryHubOrGate({ heading, pending, paywall, children }: {
  heading: string; pending: boolean; paywall: PaywallAccessState; children?: ReactNode;
}) {
  return <section className="space-y-5">
    <SectionBanner title={heading} />
    {children !== undefined ? <>
      {children}
      {/* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */}
      <div className="paywalled-library" style={{ display: 'contents' }}>
        <BattlegroundLibraryLocks label="Фильтры, сравнение карт и статистика по ходам"
          offer="Фильтры, сравнение карт и статистика по ходам доступны подписчикам" {...paywall} />
      </div>
    </> : <LibraryGate pending={pending} paywall={paywall} />}
  </section>;
}

/** A page without an open part (the archive): the gate, or its placeholder while access is checked. */
function LibraryGate({ pending, paywall }: { pending: boolean; paywall: PaywallAccessState }) {
  return pending
    ? <PaywallPending>Проверяем доступ к библиотеке...</PaywallPending>
    : <PaywallGate active title="Библиотека Полей сражений доступна подписчикам" headingLevel="h2" {...paywall} />;
}
