'use client';

import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { Breadcrumbs } from '@/src/shared/ui/EditorialRouteChrome';
import type { PublicBattlegroundHero } from '@/apps/public-web/lib/publicBattlegroundHeroData';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundHeroesRoute, loadBattlegrounds, useBattlegroundsModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundHeroPaidLocks } from './BattlegroundHeroPaidLocks';
import { navigate } from './navigation';

/**
 * `open` is the server-rendered open statistics: everyone without access sees it (a guest, a robot, a signed-in
 * visitor without a subscription), a subscriber has the interactive view in its place. `summary` is the one line
 * under the H1, built from the same facts.
 */
export function BattlegroundHeroDetailPageClient({ hero, summary, open }: {
  hero: PublicBattlegroundHero; summary: string; open: ReactNode;
}) {
  const pathname = `/heroes/${hero.dbfId}/`;
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed } = paidAccess(access, 'battlegrounds');
  // The open statistics stay (with their height) until the paid view is loaded and can replace them in one render.
  const paidViewReady = useBattlegroundsModuleLoaded(allowed);
  return <PublicPageShell activeTab="bg-heroes" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed && paidViewReady
      ? <BattlegroundHeroesRoute key={`${hero.dbfId}:${access.user?.id}`} path={pathname} onNavigate={navigate} teaser={hero} />
      : <article className="space-y-5">
        {/* The trail the page's JSON-LD names (app/heroes/[dbfId]/page.tsx). */}
        <Breadcrumbs items={[{ name: 'Главная', href: '/' }, { name: 'Герои Полей сражений', href: '/heroes/' }, { name: hero.name, href: pathname }]} />
        <header className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-3">
            <h1 className="font-hs text-3xl sm:text-4xl">{hero.name}</h1>
            <p>{summary}</p>
          </div>
          <img src={hero.image} alt={`${hero.name} — герой Полей сражений`} width="180" height="240" decoding="async" />
        </header>
        {open}
        {/* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */}
        <div className="paywalled-hero" style={{ display: 'contents' }}>
          <BattlegroundHeroPaidLocks authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />
        </div>
      </article>}
  </PublicPageShell>;
}
