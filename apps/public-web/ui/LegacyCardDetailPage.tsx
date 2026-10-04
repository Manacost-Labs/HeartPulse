'use client';
import StandardCardDetail from '@/src/features/StandardCardDetail';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import type { PublicCardSeed } from '@/src/modules/constructedCards/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** The card page. The catalog is `LegacyCardPage`, a separate bundle. */
export function LegacyCardDetailPage({ card, pathname, initialSearch }: { card: PublicCardSeed; pathname: string; initialSearch: string }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="standard-cards" pathname={pathname} access={access} navigate={navigate} wide>
    <StandardCardDetail currentPath={pathname} initialCard={card} initialSearch={initialSearch} navigatePath={navigate}
      statsAccess={access.statsAccess} statsAccessLoading={access.checking} authUser={access.user} onRefreshSubscription={access.refresh} />
  </PublicPageShell>;
}
