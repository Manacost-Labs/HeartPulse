'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import ConstructedArchetypes from '@/src/features/ConstructedArchetypes';
import type { OpenBuilds } from '@/src/features/archetypeOpenBuilds';
import type { PaidLock } from '@/src/features/ArchetypePaidFrames';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { fetchWithDeadline } from '@/src/shared/http/fetchWithDeadline';
import { publicArchetypeTeaser } from '@/apps/public-web/lib/publicArchetypeTeaserData';
import { PaidLockButton, PaidOfferProvider } from './PaidOffer';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** Pages read in one click at most while the allowlist refuses every build of them. */
const MAX_PAGES_PER_CLICK = 5;

const archetypeLock: PaidLock = ({ label, children }) => (
  <PaidLockButton className="archetype-paid-lock" label={label} closed="paywalled-archetype">{children}</PaidLockButton>
);

/**
 * The next page of the open builds: the same public answer as the server page, checked by the same allowlist. The
 * offset is the source's (`openBuildsNext` of the last answer), never the count shown, so a refused build neither
 * repeats the next one nor hides it.
 */
async function readOpenBuilds(format: 'standard' | 'wild', slug: string, offset: number) {
  let at: number | null = offset;
  for (let pages = 0; at !== null && pages < MAX_PAGES_PER_CLICK; pages += 1) {
    const response = await fetchWithDeadline(`/api/constructed-archetypes/teaser/${format}/${slug}?buildsOffset=${at}`, { deadlineMs: 10_000 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const page = publicArchetypeTeaser(await response.json(), format, slug);
    const following: number | null = page.openBuildsNext !== null && page.openBuildsNext > at ? page.openBuildsNext : null;
    if (page.openBuilds.length || following === null) return { builds: page.openBuilds, next: following };
    at = following;
  }
  return { builds: [], next: at };
}

/**
 * `openBuilds` are the builds the server printed (the guest's gallery); `children` is server-rendered text (the
 * summary) shown below the archetype, inside the shell's `<main>`. The page is the subscriber's: its paid parts
 * stand behind locks that open the offer, and the subscriber's data replaces them without remounting it.
 */
export function ArchetypeDetailPageClient({ pathname, detail, openLayer = false, openBuilds, children }: {
  pathname: string; detail: ArchetypeDetail; openLayer?: boolean;
  openBuilds?: Pick<OpenBuilds, 'builds' | 'total' | 'next'>; children?: ReactNode;
}) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  // The page is not remounted when access arrives; it is when it is lost or another account takes over,
  // so nothing of one viewer's paid data stays for the next.
  const viewer = allowed ? `member:${access.user?.id ?? ''}` : 'open';
  const [tracked, setTracked] = useState({ viewer, epoch: 0 });
  if (tracked.viewer !== viewer) setTracked({ viewer, epoch: tracked.viewer === 'open' ? tracked.epoch : tracked.epoch + 1 });
  const { format, slug } = detail.item;
  const loadMore = useCallback((offset: number) => readOpenBuilds(format, slug, offset), [format, slug]);
  const open = useMemo(() => (openBuilds ? { ...openBuilds, loadMore } : undefined), [openBuilds, loadMore]);
  return <PublicPageShell activeTab="constructed-archetypes" pathname={pathname}
    access={access} navigate={navigate} wide>
    <PaidOfferProvider entitlement="standard" title="Матчапы, муллиган, ранги и история архетипа"
      text="Винрейт против каждого класса, влияние карт на винрейт, ранги и история показателей входят в подписку «Алмаз». Сборки, коды колод и сравнение архетипов открыты всем.">
      <ConstructedArchetypes key={`${pathname}:${tracked.epoch}`} currentPath={pathname} navigatePath={navigate}
        initialDetail={detail} openLayer={openLayer} openBuilds={open} paidLock={openLayer ? archetypeLock : undefined}
        embedded hasFullAccess={allowed} accessPending={pending}
        paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
          subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
    </PaidOfferProvider>
    {children}
  </PublicPageShell>;
}
