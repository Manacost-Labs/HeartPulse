'use client';

import type { ReactNode } from 'react';
import type { ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import ConstructedArchetypes from '@/src/features/ConstructedArchetypes';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** `children` is server-rendered text (the summary) shown below the archetype, inside the shell's `<main>`. */
export function ArchetypeDetailPageClient({ pathname, detail, children }: { pathname: string; detail: ArchetypeDetail; children?: ReactNode }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  const pageKey = `${pathname}:${access.user?.id ?? 'guest'}:${allowed ? 'full' : 'teaser'}`;
  return <PublicPageShell activeTab="constructed-archetypes" pathname={pathname}
    access={access} navigate={navigate} wide>
    <ConstructedArchetypes key={pageKey} currentPath={pathname} navigatePath={navigate}
      initialDetail={detail} embedded hasFullAccess={allowed} accessPending={pending}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
    {children}
  </PublicPageShell>;
}
