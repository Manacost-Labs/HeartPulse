'use client';
import StandardCardDetail from '@/src/features/StandardCardDetail';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import type { PublicCardSeed } from '@/src/modules/constructedCards/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';
import { PaidOfferProvider } from './PaidOffer';

const OFFER_TEXT = 'Винрейт и игровые показатели карты, другие ранги и периоды и динамика открываются по подписке: '
  + 'Boosty уровня «Любитель Арены» и выше или VIP Telegram-канал. Популярность, винрейт колод и число копий остаются бесплатными.';

/** The card page. The catalog is `LegacyCardPage`, a separate bundle. */
export function LegacyCardDetailPage({ card, pathname, initialSearch }: { card: PublicCardSeed; pathname: string; initialSearch: string }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="standard-cards" pathname={pathname} access={access} navigate={navigate} wide>
    <PaidOfferProvider title="Статистика карты — по подписке" text={OFFER_TEXT} entitlement="standard">
      <StandardCardDetail currentPath={pathname} initialCard={card} initialSearch={initialSearch} navigatePath={navigate}
        statsAccess={access.statsAccess} statsAccessLoading={paidAccess(access, 'standard').pending}
        statsAccessUnavailable={paidAccess(access, 'standard').unavailable} authUser={access.user} onRefreshSubscription={access.refresh} />
    </PaidOfferProvider>
  </PublicPageShell>;
}
