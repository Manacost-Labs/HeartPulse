'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import ConstructedArchetypes, { type ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function ConstructedArchetypesPageClient({ initialSearch, initialCatalog }: {
  initialSearch: string; initialCatalog: ArchetypeCatalog | null;
}) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  return <PublicPageShell activeTab="constructed-archetypes" pathname="/standard/archetypes/"
    access={access} navigate={navigate} wide>
    <ConstructedArchetypes currentPath="/standard/archetypes/" embedded
      initialSearch={initialSearch} initialCatalog={initialCatalog} navigatePath={navigate}
      hasFullAccess={allowed} accessPending={pending}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
