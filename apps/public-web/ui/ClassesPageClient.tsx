'use client';

import type { ReactNode } from 'react';
import PaywallGate from '@/src/components/PaywallGate';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { ArenaClassesPage, ArenaClassesResults, useArenaClasses } from '@/src/modules/arenaClasses/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';
import { PaidOfferProvider } from './PaidOffer';

const ignoreUpdatedAt = (_value: string | null) => undefined;

const OFFER_TEXT = 'Разбивка по картам и периодам, история и сравнение классов открываются по подписке: '
  + 'Boosty уровня «Любитель Арены» и выше или VIP Telegram-канал. '
  + 'Порядок классов, винрейт и выборка остаются бесплатными.';

/**
 * `teaser` is the server-rendered open ranking, the same HTML for everyone: it is the page's content for a
 * guest. A subscriber gets the full ranking in its place, once its data has arrived, so the open one stays
 * until then. `hasOpenData` is false when the server had no snapshot: the page then shows the full ranking
 * behind its subscription gate.
 */
export function ClassesPageClient({ teaser, hasOpenData = true }: { teaser?: ReactNode; hasOpenData?: boolean }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'arena');
  const { state, retry } = useArenaClasses(access.user?.id, allowed, ignoreUpdatedAt);
  const updatedAtLabel = state.data?.updatedAt
    ? new Date(state.data.updatedAt).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : 'Нет данных';
  // With an open ranking the full one needs the protected data itself: a failed answer or one without classes leaves the open ranking.
  const showPaid = allowed && (hasOpenData ? (state.data?.classes.length ?? 0) > 0 : state.status !== 'loading');

  return <PublicPageShell activeTab="winrates" pathname="/classes/" parchmentPreload="tablet-up" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    <ArenaClassesPage onNavigate={navigateTab}>
      {hasOpenData && !showPaid
        ? <PaidOfferProvider title="Подробная статистика классов — по подписке" text={OFFER_TEXT}>{teaser}</PaidOfferProvider>
        /* The closed part, named by the page's JSON-LD (`hasPart.cssSelector`); a wrapper without a box of its own. */
        : <div className="paywalled-classes" style={{ display: 'contents' }}>
          <PaywallGate active={!pending && !allowed}
            title="Подтвердите подписку Манакоста для доступа к классам"
            headingLevel="h2"
            authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh}>
            <ArenaClassesResults state={state} onRetry={retry} />
          </PaywallGate>
        </div>}
    </ArenaClassesPage>
  </PublicPageShell>;
}
