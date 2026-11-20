'use client';

import type { ReactNode } from 'react';
import type { ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import ConstructedArchetypes from '@/src/features/ConstructedArchetypes';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/**
 * `openBuilds` is the server-rendered list of open builds, shown right after
 * the metrics until a subscriber's gallery replaces it; `children` is
 * server-rendered text (the summary) shown below the archetype, inside the shell's `<main>`.
 */
export function ArchetypeDetailPageClient({ pathname, detail, openLayer = false, openBuilds, children }: {
  pathname: string; detail: ArchetypeDetail; openLayer?: boolean; openBuilds?: ReactNode; children?: ReactNode;
}) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  const pageKey = `${pathname}:${access.user?.id ?? 'guest'}:${allowed ? 'full' : 'teaser'}`;
  return <PublicPageShell activeTab="constructed-archetypes" pathname={pathname}
    access={access} navigate={navigate} wide>
    <ConstructedArchetypes key={pageKey} currentPath={pathname} navigatePath={navigate}
      initialDetail={detail} openLayer={openLayer} openBuilds={openBuilds} embedded hasFullAccess={allowed} accessPending={pending}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
    {children}
  </PublicPageShell>;
}
