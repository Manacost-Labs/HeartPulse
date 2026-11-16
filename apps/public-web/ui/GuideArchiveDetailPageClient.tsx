'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import GuidesArchive, { GuideArchiveDetailHeader, type GuideDetailSeed } from '@/src/features/GuidesArchive';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/**
 * `toc` and `excerpt` are rendered on the server and are the same for robots, guests and
 * subscribers; the access check only decides whether the closed part is the full text or a gate.
 * `paidAnchors` are the ids of headings that sit in the closed part, so a link of the contents
 * lands on the gate instead of nowhere.
 */
export function GuideArchiveDetailPageClient({ pathname, teaser, toc, excerpt, hasPaid, paidAnchors }: {
  pathname: string; teaser: GuideDetailSeed; toc: ReactNode; excerpt: ReactNode; hasPaid: boolean; paidAnchors: string[];
}) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'guidesArchive');
  // The teaser header is the same markup as the full guide's, and seeds it: once
  // access is confirmed only the body changes, from the open text to the full text.
  return <PublicPageShell activeTab="guides-archive" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <GuidesArchive key={`${pathname}:${access.user?.id}`} currentPath={pathname} navigatePath={navigate}
        detailSeed={teaser} detailSlots={{ toc, excerpt }} />
      : <article className="guide-archive-detail">
        <a className="guide-archive-back" href="/guides-archive/"><ArrowLeft size={18} />К архиву</a>
        <GuideArchiveDetailHeader guide={teaser} />
        {toc}
        {excerpt}
        {hasPaid && <div className="guide-archive-paid" id="guide-archive-paid">
          {paidAnchors.map(id => <span key={id} id={id} />)}
          {pending
            ? <PaywallPending className="guide-archive-loading">Проверяем доступ к гайду...</PaywallPending>
            : <PaywallGate active title="Полный гайд доступен подписчикам"
              headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
              subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
        </div>}
      </article>}
  </PublicPageShell>;
}
