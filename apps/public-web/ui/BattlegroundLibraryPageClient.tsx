'use client';

import PaywallGate from '../../../src/components/PaywallGate';
import BgLibrary from '../../../src/features/BgLibrary';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { hasSubscriptionEntitlement } from '../../../src/modules/subscriptions/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => window.location.assign(path);

export function BattlegroundLibraryPageClient({ pathname, heading, description }: {
  pathname: string; heading: string; description: string;
}) {
  const access = usePublicAccess();
  const allowed = !access.checking && (access.admin || hasSubscriptionEntitlement(access.subscription, 'battlegrounds'));
  return <PublicPageShell activeTab="bg-library" pathname={pathname}
    access={access} navigate={navigate} wide>
    {allowed
      ? <BgLibrary key={`${pathname}:${access.user?.id}`} currentPath={pathname} navigatePath={navigate} />
      : <section className="space-y-5">
        <header className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-[0_16px_38px_rgba(68,88,122,0.14)] sm:p-6">
          <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8a651f]">Battlegrounds</p>
          <h1 className="mt-2 font-hs text-3xl text-[#23314a] sm:text-4xl">{heading}</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#5e708a]">{description}</p>
        </header>
        {access.checking
          ? <p aria-busy="true">Проверяем доступ к библиотеке...</p>
          : <PaywallGate active title="Библиотека Полей сражений доступна подписчикам"
            headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}
