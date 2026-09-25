'use client';

import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import StandardMetaPage from '../../../src/features/StandardMeta';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => window.location.assign(path);

export function StandardMetaPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && hasSubscriptionEntitlement(access.subscription, 'standard');
  const pageKey = `${access.user?.id ?? 'guest'}:${allowed ? 'full' : 'teaser'}`;
  return <PublicPageShell activeTab="standard-meta" pathname="/standard/meta/"
    access={access} navigate={navigate} wide>
    <StandardMetaPage key={pageKey} embedded hasFullAccess={allowed}
      paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
  </PublicPageShell>;
}
