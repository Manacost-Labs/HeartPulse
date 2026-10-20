'use client';

import { ArrowLeft } from 'lucide-react';
import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import GuidesArchive, { GuideArchiveDetailHeader } from '@/src/features/GuidesArchive';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import type { PublicGuideTeaser } from '@/apps/public-web/lib/publicGuideTeaserData';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function GuideArchiveDetailPageClient({ pathname, teaser }: { pathname: string; teaser: PublicGuideTeaser }) {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'guidesArchive'));
  // The teaser header is the same markup as the full guide's, and seeds it: once
  // access is confirmed only the body changes, from its placeholder to the text.
  return <PublicPageShell activeTab="guides-archive" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <GuidesArchive key={`${pathname}:${access.user?.id}`} currentPath={pathname} navigatePath={navigate} detailSeed={teaser} />
      : <article className="guide-archive-detail">
        <a className="guide-archive-back" href="/guides-archive/"><ArrowLeft size={18} />К архиву</a>
        <GuideArchiveDetailHeader guide={teaser} />
        {access.checking
          ? <PaywallPending className="guide-archive-loading">Проверяем доступ к гайду...</PaywallPending>
          : <PaywallGate active title="Полный гайд доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </article>}
  </PublicPageShell>;
}
