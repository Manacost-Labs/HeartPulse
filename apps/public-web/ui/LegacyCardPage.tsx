'use client';
import StandardCards from '@/src/features/StandardCards';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import type { PublicCardCatalogSeed } from '@/src/modules/constructedCards/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** The card catalog. The card page is `LegacyCardDetailPage`, a separate bundle. */
export function LegacyCardPage({ catalog, pathname, initialSearch }: { catalog: PublicCardCatalogSeed; pathname: string; initialSearch: string }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="standard-cards" pathname={pathname} access={access} navigate={navigate} wide>
    <StandardCards currentPath={pathname} initialCatalog={catalog} initialSearch={initialSearch} navigatePath={navigate}
      statsAccess={access.statsAccess} statsAccessLoading={access.checking} authUser={access.user} onRefreshSubscription={access.refresh} />
  </PublicPageShell>;
}
