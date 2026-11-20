'use client';

import './ClassesPage.css';
import { useMemo } from 'react';
import PaywallGate from '@/src/components/PaywallGate';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { ArenaClassesPage, ArenaClassesResults, useArenaClasses, type ArenaClassesState } from '@/src/modules/arenaClasses/public';
import type { PublicClassesTeaser } from '@/apps/public-web/lib/publicClassesTeaserData';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';
import { PaidLockButton, PaidOfferProvider } from './PaidOffer';

const ignoreUpdatedAt = (_value: string | null) => undefined;
const noRetry = () => undefined;
// The bar colour of a class the open slice names none for.
const NEUTRAL_COLOR = '#5a3000';

const OFFER_TEXT = 'Разбивка по картам и периодам, история и сравнение классов открываются по подписке: '
  + 'Boosty уровня «Любитель Арены» и выше или VIP Telegram-канал. '
  + 'Порядок классов, винрейт и выборка остаются бесплатными.';

/** The open slice as the subscriber's ranking reads it: the same rows, bars and sample, in the projection's order. */
function openClassesState(teaser: PublicClassesTeaser): ArenaClassesState {
  return {
    status: 'ready',
    data: {
      updatedAt: teaser.updatedAt, source: teaser.source,
      classes: teaser.classes.map(item => ({ id: item.id, name: item.name, winrate: item.winrate,
        color: item.color ?? NEUTRAL_COLOR, ...(item.sample === null ? {} : { games: item.sample }) })),
    },
  };
}

/** The date and source of the open slice, dated with `<time>` in Moscow time (the same text on the server and in the browser). */
function DataLine({ teaser }: { teaser: PublicClassesTeaser }) {
  const date = seoDataDate(teaser.updatedAt, Date.now());
  return <p className="classes-data-line">
    {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
    {teaser.source ? ` · источник ${teaser.source}` : ''}
  </p>;
}

/**
 * One ranking for everyone. `teaser` is the open slice the server read: a viewer without access (a guest, a robot,
 * a signed-in visitor without a subscription) gets the subscriber's ranking on it, rendered on the server, and the
 * closed part (breakdown, history, comparison) as a lock under it. A subscriber gets the same ranking, switched to
 * the protected data once it has arrived (a failed answer leaves the open one). Without a snapshot the page shows
 * the full ranking behind its subscription gate.
 */
export function ClassesPageClient({ teaser }: { teaser: PublicClassesTeaser | null }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'arena');
  const { state, retry } = useArenaClasses(access.user?.id, allowed, ignoreUpdatedAt);
  const openState = useMemo(() => teaser ? openClassesState(teaser) : null, [teaser]);
  const showPaid = allowed && (openState ? (state.data?.classes.length ?? 0) > 0 : state.status !== 'loading');
  const openLayer = openState !== null && !showPaid;
  const shown = openLayer ? openState : state;
  const updatedAtLabel = shown.data?.updatedAt
    ? new Date(shown.data.updatedAt).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : 'Нет данных';

  return <PublicPageShell activeTab="winrates" pathname="/classes/" parchmentPreload="tablet-up" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    <ArenaClassesPage onNavigate={navigateTab}>
      {teaser && <DataLine teaser={teaser} />}
      {openLayer
        ? <PaidOfferProvider title="Подробная статистика классов — по подписке" text={OFFER_TEXT}>
          <ArenaClassesResults state={openState} onRetry={noRetry} />
          <PaidLockButton className="classes-paid-more" closed="paywalled-classes"
            label="Разбивка по картам, история и сравнение классов">
            <span>Разбивка по картам, история и сравнение — по подписке</span>
          </PaidLockButton>
        </PaidOfferProvider>
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
