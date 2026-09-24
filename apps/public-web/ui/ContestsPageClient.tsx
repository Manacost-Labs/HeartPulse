'use client';

import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { ContestsPage, type Contest } from '../../../src/modules/contests/public';
import { usePublicAccess } from './usePublicAccess';

export function ContestsPageClient({ initialContests }: { initialContests: Contest[] }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="contests" pathname="/contests/" access={access}
    navigate={path => window.location.assign(path)} editorial>
    <ContestsPage initialContests={initialContests} authUser={access.user}
      subscriptionStatus={access.subscription} subscriptionLoading={access.checking}
      onRefreshSubscription={access.refresh} />
  </PublicPageShell>;
}
