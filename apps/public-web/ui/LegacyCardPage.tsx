'use client';
import StandardCards from '@/src/features/StandardCards';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import type { PublicCardCatalogSeed } from '@/src/modules/constructedCards/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** The card catalog. The card page is `LegacyCardDetailPage`, a separate bundle. */
export function LegacyCardPage({ catalog, pathname, initialSearch }: { catalog: PublicCardCatalogSeed; pathname: string; initialSearch: string }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="standard-cards" pathname={pathname} access={access} navigate={navigate} wide parchmentPreload="tablet-up">
    <StandardCards currentPath={pathname} initialCatalog={catalog} initialSearch={initialSearch} navigatePath={navigate}
      statsAccess={access.statsAccess} statsAccessLoading={paidAccess(access, 'standard').pending}
      statsAccessUnavailable={paidAccess(access, 'standard').unavailable} authUser={access.user} onRefreshSubscription={access.refresh} />
  </PublicPageShell>;
}
