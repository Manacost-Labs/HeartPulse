'use client';

import PaywallGate from '../../../src/components/PaywallGate';
import GuidesArchive from '../../../src/features/GuidesArchive';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => window.location.assign(path);

export function GuidesArchivePageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'guidesArchive'));
  return <PublicPageShell activeTab="guides-archive" pathname="/guides-archive/"
    access={access} navigate={navigate} wide>
    {allowed
      ? <GuidesArchive key={access.user?.id} currentPath="/guides-archive/" navigatePath={navigate} />
      : <section className="guide-archive-page">
        <header className="site-page-hero guide-archive-hero">
          <span className="guide-archive-eyebrow">Архив Манакоста</span>
          <h1>Архив гайдов</h1>
          <p>Старые гайды, мета-отчеты и материалы Koloda Hearthstone в удобном формате для чтения.</p>
        </header>
        {access.checking
          ? <p className="guide-archive-loading" aria-busy="true">Проверяем доступ к архиву...</p>
          : <PaywallGate active title="Архив гайдов доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
