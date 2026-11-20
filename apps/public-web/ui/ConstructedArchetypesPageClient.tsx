'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import ConstructedArchetypes, { type ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** `format="wild"` is the Wild catalog's own page, `/standard/archetypes/wild/`. */
export function ConstructedArchetypesPageClient({ initialSearch, initialCatalog, format = 'standard' }: {
  initialSearch: string; initialCatalog: ArchetypeCatalog | null; format?: 'standard' | 'wild';
}) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  const pathname = format === 'wild' ? '/standard/archetypes/wild/' : '/standard/archetypes/';
  return <PublicPageShell activeTab="constructed-archetypes" pathname={pathname}
    access={access} navigate={navigate} wide>
    <ConstructedArchetypes currentPath={pathname} embedded
      initialSearch={initialSearch} initialCatalog={initialCatalog} navigatePath={navigate}
      hasFullAccess={allowed} accessPending={pending}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
