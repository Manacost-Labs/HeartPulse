'use client';

import { useMemo, type ReactNode } from 'react';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';

import PaywallGate, { type PaywallAccessState } from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { libraryKindOf, openLibraryCards, type OpenLibraryListing } from '@/apps/public-web/lib/openBattlegroundLibrary';
import type { LibraryListingKind } from '@/apps/public-web/lib/publicBattlegroundLibraryListingData';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BgLibrary, loadBgLibrary, useBgLibraryModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundLibraryLocks } from './BattlegroundLibraryLocks';
import { BattlegroundLibraryOpenListing } from './BattlegroundLibraryOpenListing';
import { navigate } from './navigation';

/**
 * A listing page (`kind` and `listing`, `null` when the open listing is unavailable) renders the subscriber's listing
 * view for everyone: on the open cards, with its closed controls locked, for a viewer without access (a guest, a robot,
 * a signed-in visitor without a subscription), and on the protected catalog for a subscriber once its chunk is
 * loaded (seeded with the same open cards, so nothing jumps). `children` is the server-rendered open hub; a page with
 * neither (the archive) keeps the gate.
 */
export function BattlegroundLibraryPageClient({ pathname, heading, children, kind, listing }: {
  pathname: string; heading: string; description?: string; children?: ReactNode;
  kind?: LibraryListingKind; listing?: OpenLibraryListing | null;
}) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBgLibrary);
  const { allowed, pending } = paidAccess(access, 'battlegrounds');
  const cards = useMemo(() => listing ? openLibraryCards(listing) : null, [listing]);
  const open = children !== undefined || kind !== undefined;
  // The open view stays (with its height) until the paid view is loaded and can replace it in one render.
  const paidViewReady = useBgLibraryModuleLoaded(allowed);
  const paywall: PaywallAccessState = { authUser: access.user, subscriptionStatus: access.subscription,
    subscriptionLoading: access.checking, onRefreshSubscription: access.refresh };
  return <PublicPageShell activeTab="bg-library" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed && (!open || paidViewReady)
      ? <BgLibrary key={`${pathname}:${access.user?.id}`} currentPath={pathname} navigatePath={navigate}
        cacheScope={access.user ? String(access.user.id) : undefined} openCards={cards ?? undefined} heading={heading} />
      : kind !== undefined
        ? <BattlegroundLibraryOpenListing kind={libraryKindOf(kind)} heading={heading} cards={cards} paywall={paywall} />
        : <section className="space-y-5">
          <SectionBanner title={heading} />
          {open ? <>
            {children}
            {/* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */}
            <div className="paywalled-library" style={{ display: 'contents' }}>
              <BattlegroundLibraryLocks label="Фильтры, сравнение карт и статистика по ходам"
                offer="Фильтры, сравнение карт и статистика по ходам доступны подписчикам" {...paywall} />
            </div>
          </> : <LibraryGate pending={pending} paywall={paywall} />}
        </section>}
  </PublicPageShell>;
}

/** A page without an open part (the archive): the gate, or its placeholder while access is checked. */
function LibraryGate({ pending, paywall }: { pending: boolean; paywall: PaywallAccessState }) {
  return pending
    ? <PaywallPending>Проверяем доступ к библиотеке...</PaywallPending>
    : <PaywallGate active title="Библиотека Полей сражений доступна подписчикам" headingLevel="h2" {...paywall} />;
}
