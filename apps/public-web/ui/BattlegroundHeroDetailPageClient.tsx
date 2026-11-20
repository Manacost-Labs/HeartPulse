'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { Breadcrumbs } from '@/src/shared/ui/EditorialRouteChrome';
import { BattlegroundHeroDetailView } from '@/src/features/BattlegroundHeroDetailView';
import type { BattlegroundHeroDetailLibraryHero, BattlegroundHeroDetailStats } from '@/src/features/battlegroundHeroDetailTypes';
import type { PublicBattlegroundHero } from '@/apps/public-web/lib/publicBattlegroundHeroData';
import type { PublicBattlegroundHeroStats } from '@/apps/public-web/lib/publicBattlegroundHeroStats';
import type { SeoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BattlegroundHeroesRoute, loadBattlegrounds, useBattlegroundsModuleLoaded, usePaidViewPrefetch } from './lazyBattlegrounds';
import { BattlegroundHeroOpenStatistics } from './BattlegroundHeroOpenStatistics';
import { PaidOfferProvider } from './PaidOffer';
import { navigate } from './navigation';

const OFFER_TEXT = 'Распределение мест, бои, сила героя и таверна по ходам, составы с местами и винрейтом, '
  + 'узкие рейтинги Топ 20%, 5% и 1% открываются по подписке Полей сражений. '
  + 'Тир, среднее место, топ-4, выбор, арт, компаньоны, скины и история патчей остаются бесплатными.';

/**
 * One hero page for everyone. `detail` is the open data the server read (identity, profile, the base-range row) in
 * the shapes of the subscriber's view: a viewer without access (a guest, a robot, a signed-in visitor without a
 * subscription) gets that view, rendered on the server, with locks in place of the paid analytics. A subscriber gets
 * the same view on the protected data once its module has loaded (the open view stays until then, with its height).
 */
export function BattlegroundHeroDetailPageClient({ hero, detail, openStats, openDate }: {
  hero: PublicBattlegroundHero;
  detail: { stats: BattlegroundHeroDetailStats; libraryHero: BattlegroundHeroDetailLibraryHero };
  openStats: PublicBattlegroundHeroStats | null;
  /** The date of the open figures, computed on the server (one text for SSR and hydration). */
  openDate: SeoDataDate | null;
}) {
  const pathname = `/heroes/${hero.dbfId}/`;
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const { allowed } = paidAccess(access, 'battlegrounds');
  const paidViewReady = useBattlegroundsModuleLoaded(allowed);
  return <PublicPageShell activeTab="bg-heroes" pathname={pathname}
    access={access} navigate={navigate} wide>
    {/* The trail the page's JSON-LD names (app/heroes/[dbfId]/page.tsx). */}
    <Breadcrumbs items={[{ name: 'Главная', href: '/' }, { name: 'Герои Полей сражений', href: '/heroes/' }, { name: hero.name, href: pathname }]} />
    {allowed && paidViewReady
      ? <BattlegroundHeroesRoute key={`${hero.dbfId}:${access.user?.id}`} path={pathname} onNavigate={navigate} teaser={hero} />
      : <PaidOfferProvider title="Аналитика героя — по подписке" text={OFFER_TEXT} entitlement="battlegrounds">
        <BattlegroundHeroDetailView dbfId={String(hero.dbfId)} stats={detail.stats} libraryHero={detail.libraryHero}
          onNavigate={navigate} statistics={() => <BattlegroundHeroOpenStatistics stats={openStats} date={openDate} />} />
      </PaidOfferProvider>}
  </PublicPageShell>;
}
