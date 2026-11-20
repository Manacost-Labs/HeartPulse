'use client';

import { useState } from 'react';
import type { PaywallAccessState } from '@/src/components/PaywallGate';
import { createBattlegroundLibraryResource, useBattlegroundLibraryData } from '@/src/modules/battlegrounds/public';
import { BgLibraryListPage, type BgLibraryListData } from '@/src/features/BgLibraryListPage';
import type { LibraryCard, LibraryMeta } from '@/src/features/bgLibraryCards';
import type { LibraryKind } from '@/src/features/bgLibrarySections';
import { OPEN_LIBRARY_META } from '@/apps/public-web/lib/openBattlegroundLibrary';
import { useBgLibraryCatalogResource } from './lazyBattlegrounds';
import { navigate } from './navigation';

const UNAVAILABLE = 'Список карт временно недоступен. Попробуйте позже.';
const reload = () => window.location.reload();
/** No catalog yet (no access, or the library chunk still loading): a read that never answers. */
const NO_CATALOG = createBattlegroundLibraryResource<{ cards: LibraryCard[]; meta: LibraryMeta }>(() => new Promise(() => undefined));

/** What the listing shows: the protected catalog once it has arrived, the open cards until then (and without access). */
function listingData(cards: LibraryCard[] | null, paid: BgLibraryListData | null): BgLibraryListData {
  if (paid?.data) return paid;
  const open = cards ? { cards, meta: OPEN_LIBRARY_META } : null;
  if (paid) return { data: open, loading: paid.loading && !open, error: paid.error || null, retry: paid.retry };
  return { data: open, loading: false, error: open ? null : UNAVAILABLE, retry: reload };
}

/**
 * `/library/<kind>/` for everyone, in one listing view that is never remounted. The server HTML and every viewer
 * without access (a guest, a robot, a signed-in visitor without a subscription) get it on the open cards, with the
 * archive locked in place. For a subscriber (`subscriber`, with the catalog scope of the viewer) the same view reads the
 * protected catalog once the library chunk is loaded and swaps its cards when it has arrived: the search, filters and
 * pages the viewer has already set stay, and the container keeps its element (`.arena-paid-view` from then on).
 */
export function BattlegroundLibraryOpenListing({ kind, heading, cards, paywall, subscriber }: {
  kind: LibraryKind; heading: string; cards: LibraryCard[] | null; paywall: PaywallAccessState;
  subscriber: { cacheScope?: string } | null;
}) {
  const catalog = useBgLibraryCatalogResource(subscriber !== null);
  const [attempt, setAttempt] = useState(0);
  const read = useBattlegroundLibraryData(catalog ?? NO_CATALOG, kind, 'current', subscriber?.cacheScope, attempt);
  // Derived in render from the current viewer: without access (or after a sign-out) no catalog read is shown.
  const live = Boolean(catalog && subscriber);
  const paid = live ? { ...read, error: read.error || null, retry: () => setAttempt(value => value + 1) } : null;
  return <div className={live ? 'arena-paid-view' : 'bg-library-open-view'}>
    <BgLibraryListPage kind={kind} pool="current" navigatePath={navigate} paywall={subscriber ? undefined : paywall}
      heading={heading} library={listingData(cards, paid)} />
  </div>;
}
