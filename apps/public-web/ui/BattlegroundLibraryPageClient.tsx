'use client';

import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';

import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { BgLibrary, loadBgLibrary, usePaidViewPrefetch } from './lazyBattlegrounds';
import { navigate } from './navigation';

export function BattlegroundLibraryPageClient({ pathname, heading, description }: {
  pathname: string; heading: string; description: string;
}) {
  const access = usePublicAccess();
  usePaidViewPrefetch(loadBgLibrary);
  const { allowed, pending } = paidAccess(access, 'battlegrounds');
  return <PublicPageShell activeTab="bg-library" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <BgLibrary key={`${pathname}:${access.user?.id}`} currentPath={pathname} navigatePath={navigate} cacheScope={access.user ? String(access.user.id) : undefined} />
      : <section className="space-y-5">
        <SectionBanner title={heading} subtitle={description} />
        {pending
          ? <PaywallPending>Проверяем доступ к библиотеке...</PaywallPending>
          : <PaywallGate active title="Библиотека Полей сражений доступна подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
