'use client';
import StandardCards from '../../../src/features/StandardCards';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import type { PublicCardSeed, PublicCardCatalogSeed } from '../../../src/modules/constructedCards/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => { window.location.assign(path); };
type Props = { pathname: string; initialSearch: string } & ({ card: PublicCardSeed; catalog?: never } | { catalog: PublicCardCatalogSeed; card?: never });
export function LegacyCardPage({ card, catalog, pathname, initialSearch }: Props) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="standard-cards" pathname={pathname} access={access} navigate={navigate} wide>
    <StandardCards currentPath={pathname} initialCard={card} initialCatalog={catalog} initialSearch={initialSearch} navigatePath={navigate}
      statsAccess={access.statsAccess} statsAccessLoading={access.checking} authUser={access.user} onRefreshSubscription={access.refresh} />
  </PublicPageShell>;
}
