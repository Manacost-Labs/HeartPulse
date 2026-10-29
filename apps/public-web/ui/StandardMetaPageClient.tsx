'use client';

import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import StandardMetaPage from '@/src/features/StandardMeta';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';
import { sessionTag } from './viewerHint';

/** `children` is server-rendered content (the data note) shown below the meta page, inside the shell's `<main>`. */
export function StandardMetaPageClient({ initialTeaser, children }: { initialTeaser: StandardMetaTeaserSeed | null; children?: ReactNode }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  // The teaser is the same for every viewer, so it is not reloaded when the
  // check names the account; full access belongs to that account.
  const pageKey = allowed ? `${access.user?.id ?? ''}:full` : 'teaser';
  return <PublicPageShell activeTab="standard-meta" pathname="/standard/meta/"
    access={access} navigate={navigate} wide>
    <StandardMetaPage key={pageKey} embedded hasFullAccess={allowed} accessPending={pending}
      teaserWaitsForAccess={pending && sessionTag() !== null} initialTeaser={initialTeaser}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
    {children}
  </PublicPageShell>;
}
