'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import ConstructedArchetypes, { type ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function ConstructedArchetypesPageClient({ initialSearch, initialCatalog }: {
  initialSearch: string; initialCatalog: ArchetypeCatalog | null;
}) {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'standard'));
  const pageKey = `${access.user?.id ?? 'guest'}:${allowed ? 'full' : 'teaser'}`;
  return <PublicPageShell activeTab="constructed-archetypes" pathname="/standard/archetypes/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} wide>
    <ConstructedArchetypes key={pageKey} currentPath="/standard/archetypes/" embedded
      initialSearch={initialSearch} initialCatalog={initialCatalog} navigatePath={navigate}
      hasFullAccess={allowed} accessPending={access.checking}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
