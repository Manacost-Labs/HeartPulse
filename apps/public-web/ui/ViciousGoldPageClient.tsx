'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { ViciousGoldBanner, ViciousGoldLoading } from '@/src/features/viciousGold/ViciousGoldBanner';
import { moduleLoader, useLoadedModule, usePaidViewPrefetch } from './lazyPaidView';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

// The report (VaryloUI charts, the deck block and their stylesheets) is a chunk
// of its own: a guest downloads the banner and the gate only.
const viciousGold = moduleLoader(() => import('@/src/features/ViciousSyndicateGold'));

/** The report once its chunk is in; until then the same banner and loader the report shows while its data loads. */
function ViciousGoldReport() {
  const View = useLoadedModule(viciousGold)?.default;
  return View ? <View /> : <section className="vsgold"><ViciousGoldBanner /><ViciousGoldLoading /></section>;
}

export function ViciousGoldPageClient() {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  usePaidViewPrefetch(viciousGold.load);
  return <PublicPageShell activeTab="standard-vicious-gold" pathname="/standard/vicious-gold/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} wide>
    {allowed
      ? <ViciousGoldReport key={access.user?.id} />
      : <section className="vsgold">
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
