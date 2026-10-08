'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import PaywallGate from '@/src/components/PaywallGate';
import ViciousSyndicateGold from '@/src/features/ViciousSyndicateGold';
import { ViciousGoldBanner, ViciousGoldLoading } from '@/src/features/viciousGold/ViciousGoldBanner';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function ViciousGoldPageClient() {
  const access = usePublicAccess();
  const allowed = !access.checking && access.statsAccess;
  return <PublicPageShell activeTab="standard-vicious-gold" pathname="/standard/vicious-gold/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} wide>
    {allowed
      ? <ViciousSyndicateGold key={access.user?.id} />
      : <section className="vsgold space-y-5 sm:space-y-6">
        <ViciousGoldBanner />
        {/* The access check holds the statistics' place, so a subscriber's page does not jump when they arrive. */}
        {access.checking && <ViciousGoldLoading />}
        <PaywallGate active={!access.checking}
          title="Подтвердите подписку Манакоста для доступа к Vicious Syndicate Gold"
          variant="standard" headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
          subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />
      </section>}
  </PublicPageShell>;
}
