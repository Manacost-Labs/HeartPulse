'use client';

import type { ArchetypeDetail } from '../../../src/features/ConstructedArchetypes';
import ConstructedArchetypes from '../../../src/features/ConstructedArchetypes';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => window.location.assign(path);

export function ArchetypeDetailPageClient({ pathname, detail }: { pathname: string; detail: ArchetypeDetail }) {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'standard'));
  const pageKey = `${pathname}:${access.user?.id ?? 'guest'}:${allowed ? 'full' : 'teaser'}`;
  return <PublicPageShell activeTab="constructed-archetypes" pathname={pathname}
    access={access} navigate={navigate} wide>
    <ConstructedArchetypes key={pageKey} currentPath={pathname} navigatePath={navigate}
      initialDetail={detail} embedded hasFullAccess={allowed}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
