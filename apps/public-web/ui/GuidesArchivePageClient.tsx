'use client';

import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import GuidesArchive from '@/src/features/GuidesArchive';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function GuidesArchivePageClient() {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'guidesArchive');
  return <PublicPageShell activeTab="guides-archive" pathname="/guides-archive/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} wide>
    {allowed
      ? <GuidesArchive key={access.user?.id} currentPath="/guides-archive/" navigatePath={navigate} />
      : <section className="guide-archive-page">
        <SectionBanner title="Архив гайдов" />
        {pending
          ? <PaywallPending className="guide-archive-loading">Проверяем доступ к архиву...</PaywallPending>
          : <PaywallGate active title="Архив гайдов доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
