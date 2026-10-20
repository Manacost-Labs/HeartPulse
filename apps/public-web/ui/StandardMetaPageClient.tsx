'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import StandardMetaPage from '@/src/features/StandardMeta';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function StandardMetaPageClient({ initialTeaser }: { initialTeaser: StandardMetaTeaserSeed | null }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  // The teaser is the same for every viewer, so it is not reloaded when the
  // check names the account; full access belongs to that account.
  const pageKey = allowed ? `${access.user?.id ?? ''}:full` : 'teaser';
  return <PublicPageShell activeTab="standard-meta" pathname="/standard/meta/"
    access={access} navigate={navigate} wide>
    <StandardMetaPage key={pageKey} embedded hasFullAccess={allowed} accessPending={pending}
      initialTeaser={initialTeaser}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
