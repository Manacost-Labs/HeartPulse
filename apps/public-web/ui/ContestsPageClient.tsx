'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { ContestsPage, type Contest } from '@/src/modules/contests/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function ContestsPageClient({ initialContests }: { initialContests: Contest[] }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="contests" pathname="/contests/" access={access}
    navigate={navigate} editorial>
    {/* Entries are the viewer's own: another viewer, or none while access is
        checked again, starts from the public list. */}
    <ContestsPage key={access.user?.id ?? 'guest'} initialContests={initialContests} authUser={access.user}
      subscriptionStatus={access.subscription} subscriptionLoading={access.checking}
      onRefreshSubscription={access.refresh} />
  </PublicPageShell>;
}
