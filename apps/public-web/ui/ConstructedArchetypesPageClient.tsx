'use client';

import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import ConstructedArchetypes from '../../../src/features/ConstructedArchetypes';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => window.location.assign(path);

export function ConstructedArchetypesPageClient({ initialSearch }: { initialSearch: string }) {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'standard'));
  const pageKey = `${access.user?.id ?? 'guest'}:${allowed ? 'full' : 'teaser'}`;
  return <PublicPageShell activeTab="constructed-archetypes" pathname="/standard/archetypes/"
    access={access} navigate={navigate} wide>
    <ConstructedArchetypes key={pageKey} currentPath="/standard/archetypes/" embedded
      initialSearch={initialSearch} navigatePath={navigate} hasFullAccess={allowed}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
