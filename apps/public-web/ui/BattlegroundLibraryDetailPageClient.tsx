'use client';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import BgLibrary from '@/src/features/BgLibrary';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '@/src/modules/subscriptions/public';
import type { PublicBattlegroundLibraryCard } from '@/apps/public-web/lib/publicBattlegroundLibraryCardData';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function BattlegroundLibraryDetailPageClient({ card }: { card: PublicBattlegroundLibraryCard }) {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'battlegrounds'));
  return <PublicPageShell activeTab="bg-library" pathname={card.canonicalPath}
    access={access} navigate={navigate} wide>
    {allowed
      ? <BgLibrary key={`${card.dbfId}:${access.user?.id}`} currentPath={card.canonicalPath} navigatePath={navigate} />
      : <article className="space-y-5">
        <a href="/library/" className="inline-flex min-h-11 items-center rounded-md border border-[#d7b66a] px-3 py-2">Все карты Полей сражений</a>
        <header className="traditional-mode-banner">
          <div className="traditional-mode-banner__copy">
            <h1>{card.name}</h1>
            <p>{card.typeName} режима «Поля сражений» в Hearthstone.</p>
            {card.text && <p>{card.text}</p>}
          </div>
          <img src={card.image} alt="" width="180" height="240" decoding="async" />
        </header>
        {access.checking
          ? <PaywallPending>Проверяем доступ к статистике карты...</PaywallPending>
          : <PaywallGate active title="Статистика карты доступна подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </article>}
  </PublicPageShell>;
}
