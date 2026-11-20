'use client';

import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { Breadcrumbs } from '@/src/shared/ui/EditorialRouteChrome';
import type { PublicBattlegroundLibraryCard } from '@/apps/public-web/lib/publicBattlegroundLibraryCardData';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BgLibrary, loadBgLibrary, useBgLibraryModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundLibraryLocks } from './BattlegroundLibraryLocks';
import { navigate } from './navigation';

/**
 * `open` is the server-rendered open layer of the card: everyone without access sees it (a guest, a robot, a
 * signed-in visitor without a subscription), a subscriber has the interactive view in its place. `summary` is the one
 * line under the H1, built from the same facts. `crumbs` is the trail the page's JSON-LD names, the card last.
 */
export function BattlegroundLibraryDetailPageClient({ card, summary, open, crumbs }: {
  card: PublicBattlegroundLibraryCard; summary: string; open: ReactNode; crumbs: Array<{ name: string; href: string }>;
}) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBgLibrary);
  const { allowed } = paidAccess(access, 'battlegrounds');
  // The open layer stays (with its height) until the paid view is loaded and can replace it in one render.
  const paidViewReady = useBgLibraryModuleLoaded(allowed);
  return <PublicPageShell activeTab="bg-library" pathname={card.canonicalPath}
    access={access} navigate={navigate} wide>
    {allowed && paidViewReady
      ? <BgLibrary key={`${card.dbfId}:${access.user?.id}`} currentPath={card.canonicalPath} navigatePath={navigate} teaser={card} />
      : <article className="space-y-5">
        <Breadcrumbs items={crumbs} />
        <header className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-3">
            <h1 className="font-hs text-3xl sm:text-4xl">{card.name}</h1>
            <p>{summary}</p>
          </div>
          <img src={card.image} alt={`${card.name} — ${card.typeName.toLocaleLowerCase('ru-RU')} Полей сражений`} width="180" height="240" decoding="async" />
        </header>
        {open}
        {/* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */}
        <div className="paywalled-library-card" style={{ display: 'contents' }}>
          <BattlegroundLibraryLocks label="Сила по ходам, покупки, позиции на столе и история"
            offer="Статистика карты по ходам, позиции на столе и история доступны подписчикам"
            authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />
        </div>
      </article>}
  </PublicPageShell>;
}
