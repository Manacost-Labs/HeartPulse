'use client';

import PaywallGate from '../../../src/components/PaywallGate';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { BattlegroundTierBuilderEmbed } from '../../../src/features/Battlegrounds';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const pathname = '/battlegrounds/tier-builder/';
const navigate = (path: string) => window.location.assign(path);

export function BattlegroundTierBuilderPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'battlegrounds'));
  return <PublicPageShell activeTab="bg-tier-builder" pathname={pathname}
    access={access} navigate={navigate} wide>
    <section className="space-y-5">
      <header className="rounded-lg border border-[#6b4c2a]/40 bg-[#f4e3b9] px-4 py-4 text-center text-[#3d2a1e] shadow-sm">
        <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#674929]">Поля сражений</p>
        <h1 className="mt-2 font-hs text-3xl sm:text-4xl">Конструктор тир-листов Полей сражений</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm">Создавайте собственные тир-листы героев и карт Полей сражений.</p>
      </header>
      {allowed
        ? <BattlegroundTierBuilderEmbed key={access.user?.id} />
        : access.checking
          ? <p aria-busy="true">Проверяем доступ к конструктору тир-листов...</p>
          : <PaywallGate active title="Конструктор тир-листов доступен подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
    </section>
  </PublicPageShell>;
}
