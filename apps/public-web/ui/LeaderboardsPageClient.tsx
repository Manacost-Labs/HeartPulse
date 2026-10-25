'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { LeaderboardsView, type LeaderboardsInitial } from '@/src/modules/leaderboards/public';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** Официальные таблицы лидеров Blizzard: сервер кладёт в HTML первую страницу и сводку, остальное грузит браузер. */
export function LeaderboardsPageClient({ initial }: { initial: LeaderboardsInitial }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="leaderboards" pathname="/leaderboards/" access={access} navigate={navigate} wide>
    <section className="leaderboards-page space-y-4">
      <SectionBanner title="Таблицы лидеров"
        subtitle="Официальные рейтинги Blizzard по режимам и регионам: места, рейтинг и история игроков" />
      <LeaderboardsView initial={initial} />
    </section>
  </PublicPageShell>;
}
