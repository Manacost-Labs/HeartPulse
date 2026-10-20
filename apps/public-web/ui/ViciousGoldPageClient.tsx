'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import ViciousSyndicateGold from '@/src/features/ViciousSyndicateGold';
import { ViciousGoldBanner } from '@/src/features/viciousGold/ViciousGoldBanner';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function ViciousGoldPageClient() {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  return <PublicPageShell activeTab="standard-vicious-gold" pathname="/standard/vicious-gold/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} wide>
    {allowed
      ? <ViciousSyndicateGold key={access.user?.id} />
      : <section className="vsgold space-y-5 sm:space-y-6">
        <ViciousGoldBanner />
        {/* The access check holds the gate's place and shows no locked preview. */}
        {pending
          ? <PaywallPending>Проверяем доступ к Vicious Syndicate Gold…</PaywallPending>
          : <PaywallGate active
            title="Подтвердите подписку Манакоста для доступа к Vicious Syndicate Gold"
            variant="standard" headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
