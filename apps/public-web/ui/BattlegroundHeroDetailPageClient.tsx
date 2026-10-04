'use client';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import type { PublicBattlegroundHero } from '@/apps/public-web/lib/publicBattlegroundHeroData';
import { usePublicAccess } from './usePublicAccess';
import { BattlegroundHeroesRoute, loadBattlegrounds, usePaidViewPrefetch } from './lazyBattlegrounds';
import { navigate } from './navigation';

export function BattlegroundHeroDetailPageClient({ hero }: { hero: PublicBattlegroundHero }) {
  const pathname = `/heroes/${hero.dbfId}/`;
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBattlegrounds);
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'battlegrounds'));
  return <PublicPageShell activeTab="bg-heroes" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <BattlegroundHeroesRoute key={`${hero.dbfId}:${access.user?.id}`} path={pathname} onNavigate={navigate} />
      : <article className="space-y-5">
        <a href="/heroes/" className="inline-flex min-h-11 items-center rounded-md border border-[#d7b66a] px-3 py-2">Все герои</a>
        <header className="traditional-mode-banner">
          <div className="traditional-mode-banner__copy">
            <h1>{hero.name}</h1>
            <p>Герой режима «Поля сражений» в Hearthstone.</p>
            {hero.heroPower && <p>Сила героя «{hero.heroPower.name}»{hero.heroPower.text ? `: ${hero.heroPower.text}` : '.'}</p>}
          </div>
          <img src={hero.image} alt="" width="180" height="240" decoding="async" />
        </header>
        {access.checking
          ? <PaywallPending>Проверяем доступ к статистике героя...</PaywallPending>
          : <PaywallGate active title="Статистика героя доступна подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </article>}
  </PublicPageShell>;
}
