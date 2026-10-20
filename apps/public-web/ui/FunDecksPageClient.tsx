'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import FunDecksPage from '@/src/features/FunDecksPage';
import type { FunDecksPayload } from '@/src/features/funDecksPreview';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function FunDecksPageClient({ initialPreview }: { initialPreview: FunDecksPayload | null }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  const pageKey = `${access.user?.id ?? 'guest'}:${allowed ? 'full' : 'teaser'}`;
  return <PublicPageShell activeTab="fun-decks" pathname="/standard/fun-decks/"
    access={access} navigate={navigate} wide>
    <FunDecksPage key={pageKey} hasFullAccess={allowed} accessPending={pending} initialPreview={initialPreview}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
