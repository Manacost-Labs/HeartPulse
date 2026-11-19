'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { TierListSkeleton } from '@/src/features/TierListSkeleton';
import { Breadcrumbs, SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import { useArenaCompanionIds, useArenaTierList,
  type TierlistData } from '@/src/modules/arenaTierList/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';
import { PaidOfferProvider } from './PaidOffer';

type PaidTierListComponent = typeof import('@/src/features/DeferredRoutes').TierList;

const EMPTY_DATA: TierlistData = {
  sections: [], cards: {}, updatedAt: null, source: 'hsreplay',
};

const OFFER_TEXT = 'Оценка ArenaSmith, винрейт при розыгрыше и сыгрывании, фильтры по мане и редкости, поиск и история '
  + 'открываются по подписке: Boosty уровня «Любитель Арены» и выше или VIP Telegram-канал. '
  + 'Тир, винрейт и частота выбора каждой карты остаются бесплатными.';

/** The class a visitor chose before signing in comes back in the address (`?class=mage`). */
const requestedClass = (data: TierlistData) => {
  const id = new URLSearchParams(window.location.search).get('class');
  return id && data.sections.some(section => section.id === id) ? id : undefined;
};

/**
 * `children` is the server-rendered open tier list (the whole card pool, the same HTML for everyone) and it
 * is the page's content for a guest. A subscriber gets the full interactive view in its place, but only once
 * its code and data have arrived, so the open list stays until then. `hasOpenData` is false when the server had
 * no snapshot: the page then falls back to the full view and its subscription gate.
 */
export function TierListPageClient({ children, hasOpenData = true }: { children?: ReactNode; hasOpenData?: boolean }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'arena');
  const tierlist = useArenaTierList(access.user?.id, allowed);
  const companionIds = useArenaCompanionIds(access.user?.id, allowed && tierlist.source !== 'hsreplay');
  const data = tierlist.state.data ?? { ...EMPTY_DATA, source: tierlist.source };
  const [updatedAtLabel, setUpdatedAtLabel] = useState('Нет данных');
  useEffect(() => {
    setUpdatedAtLabel(data.updatedAt
      ? new Date(data.updatedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'Нет данных');
  }, [data.updatedAt]);
  // The full view is a separate chunk: a guest never downloads it unless the page has nothing open to show.
  const [Paid, setPaid] = useState<{ view: PaidTierListComponent } | null>(null);
  const wantsPaid = allowed || !hasOpenData;
  useEffect(() => {
    if (!wantsPaid) return;
    let current = true;
    void import('@/src/features/DeferredRoutes').then(module => { if (current) setPaid({ view: module.TierList }); });
    return () => { current = false; };
  }, [wantsPaid]);
  // With an open list the full view needs the protected data itself: a failed answer or one without sections leaves the open list.
  const showPaid = Paid !== null && (hasOpenData ? allowed && (tierlist.state.data?.sections.length ?? 0) > 0 : true);

  return <PublicPageShell activeTab="tierlist" pathname="/tierlist/" parchmentPreload="tablet-up" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    {showPaid && Paid
      /* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */
      ? <div className="paywalled-tierlist" style={{ display: 'contents' }}>
        <Paid.view data={data} loading={tierlist.loading || pending}
          error={tierlist.error} companionIds={companionIds}
          tierlistSource={tierlist.source} onTierlistSourceChange={tierlist.changeSource}
          switchingTierlistSource={tierlist.switching} onNavigate={navigateTab}
          authUser={access.user} subscriptionStatus={access.subscription}
          subscriptionLoading={pending} onRefreshSubscription={access.refresh}
          accessGranted={allowed} initialClassId={requestedClass(data)} />
      </div>
      : <div className="arena-tierlist-page">
        <SectionBanner title="Тир-лист карт Арены Hearthstone" subtitle="Оценки карт для каждого класса — текущий патч" />
        <Breadcrumbs items={[
          { name: 'Главная', href: '/', onClick: () => navigateTab('home') },
          { name: 'Тир-лист', href: '/tierlist/' },
        ]} />
        {hasOpenData
          ? <PaidOfferProvider title="Остальные показатели карт — по подписке" text={OFFER_TEXT}>{children}</PaidOfferProvider>
          : <div className="paywalled-tierlist" style={{ display: 'contents' }}><TierListSkeleton /></div>}
      </div>}
  </PublicPageShell>;
}
