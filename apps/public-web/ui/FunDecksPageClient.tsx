'use client';

import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import FunDecksPage from '../../../src/features/FunDecksPage';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => window.location.assign(path);

export function FunDecksPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'standard'));
  const pageKey = `${access.user?.id ?? 'guest'}:${allowed ? 'full' : 'teaser'}`;
  return <PublicPageShell activeTab="fun-decks" pathname="/standard/fun-decks/"
    access={access} navigate={navigate} wide>
    <FunDecksPage key={pageKey} hasFullAccess={allowed}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
