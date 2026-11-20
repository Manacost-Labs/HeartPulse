'use client';

import type { PaywallAccessState } from '@/src/components/PaywallGate';
import { BgLibraryListPage } from '@/src/features/BgLibraryListPage';
import type { LibraryCard } from '@/src/features/bgLibraryCards';
import type { LibraryKind } from '@/src/features/bgLibrarySections';
import { OPEN_LIBRARY_META } from '@/apps/public-web/lib/openBattlegroundLibrary';
import { navigate } from './navigation';

const UNAVAILABLE = 'Список карт временно недоступен. Попробуйте позже.';
const reload = () => window.location.reload();

/**
 * What a viewer without access (a guest, a robot, a signed-in visitor without a subscription) gets on
 * `/library/<kind>/`, in the server HTML: the subscriber's listing on the open cards, with the archive and the
 * mechanic filters locked in place. Without the open listing the same view says it is unavailable.
 */
export function BattlegroundLibraryOpenListing({ kind, heading, cards, paywall }: {
  kind: LibraryKind; heading: string; cards: LibraryCard[] | null; paywall: PaywallAccessState;
}) {
  return <BgLibraryListPage kind={kind} pool="current" navigatePath={navigate} paywall={paywall} heading={heading}
    library={{ data: cards ? { cards, meta: OPEN_LIBRARY_META } : null, loading: false, error: cards ? null : UNAVAILABLE, retry: reload }} />;
}
