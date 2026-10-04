'use client';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import GuidesArchive from '@/src/features/GuidesArchive';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import type { PublicGuideTeaser } from '@/apps/public-web/lib/publicGuideTeaserData';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function GuideArchiveDetailPageClient({ pathname, teaser }: { pathname: string; teaser: PublicGuideTeaser }) {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'guidesArchive'));
  return <PublicPageShell activeTab="guides-archive" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <GuidesArchive key={`${pathname}:${access.user?.id}`} currentPath={pathname} navigatePath={navigate} />
      : <article className="guide-archive-detail">
        <a className="guide-archive-back" href="/guides-archive/">К архиву</a>
        <header className="guide-archive-detail-header">
          {teaser.image && <img className="guide-archive-detail-cover" src={teaser.image} alt="" loading="lazy" decoding="async" />}
          <div>
            {teaser.kind && <span className="guide-archive-eyebrow">{teaser.kind}</span>}
            <h1>{teaser.title}</h1>
            {teaser.description && <p>{teaser.description}</p>}
          </div>
        </header>
        {access.checking
          ? <PaywallPending className="guide-archive-loading">Проверяем доступ к гайду...</PaywallPending>
          : <PaywallGate active title="Полный гайд доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </article>}
  </PublicPageShell>;
}
