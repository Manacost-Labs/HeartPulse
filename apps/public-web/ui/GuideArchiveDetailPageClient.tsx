'use client';

import './GuideArchiveLock.css';
import type { ReactNode } from 'react';
import GuidesArchive, { type GuideDetailSeed } from '@/src/features/GuidesArchive';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';
import { PaidLockButton, PaidOfferProvider } from './PaidOffer';

const OFFER_TEXT = 'Продолжение гайда открывается по подписке: Boosty уровня «Любитель Арены» и выше '
  + 'или VIP Telegram-канал. Начало и оглавление гайда остаются бесплатными.';

/**
 * One guide page for everyone. `toc` and `excerpt` are rendered on the server and are the same for robots, guests
 * and subscribers. Where the closed part begins a viewer without access gets a lock (`.guide-archive-paid`, the
 * part the page's JSON-LD names) that opens the subscription offer; a subscriber gets the same page with the full
 * text in place of the lock, without a remount. `paidAnchors` are the ids of headings that sit in the closed part,
 * so a link of the contents lands on the lock instead of nowhere.
 */
export function GuideArchiveDetailPageClient({ pathname, teaser, toc, excerpt, hasPaid, paidAnchors }: {
  pathname: string; teaser: GuideDetailSeed; toc: ReactNode; excerpt: ReactNode; hasPaid: boolean; paidAnchors: string[];
}) {
  const access = usePublicAccess();
  const { allowed } = paidAccess(access, 'guidesArchive');
  const lock = hasPaid ? <div className="guide-archive-paid" id="guide-archive-paid">
    {paidAnchors.map(id => <span key={id} id={id} />)}
    <PaidLockButton className="guide-archive-lock" closed="paywalled-guides" label="Продолжение гайда">
      <span>Продолжение гайда — по подписке</span>
    </PaidLockButton>
  </div> : null;
  return <PublicPageShell activeTab="guides-archive" pathname={pathname}
    access={access} navigate={navigate} wide>
    <PaidOfferProvider title="Полный гайд — по подписке" text={OFFER_TEXT}>
      <GuidesArchive currentPath={pathname} navigatePath={navigate} hasAccess={allowed}
        detailSeed={teaser} detailSlots={{ toc, excerpt, lock }} />
    </PaidOfferProvider>
  </PublicPageShell>;
}
