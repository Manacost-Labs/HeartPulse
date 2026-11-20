'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import StandardMetaPage from '@/src/features/StandardMeta';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';
import { PaidOfferProvider, usePaidOffer } from './PaidOffer';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { useHydrated } from '@/src/shared/ui/useHydrated';
import { navigate } from './navigation';
import { sessionTag } from './viewerHint';

const OFFER_TITLE = 'Узкие срезы, история и тренды — в подписке';
const OFFER_TEXT = 'Другие ранги и периоды, очерёдность хода, порог игр, ходы, длительность, скорость набора и динамика архетипов открываются подпиской.';

function MetaView({ initialTeaser, format, hasFullAccess, teaserWaitsForAccess, accessPending }: {
  initialTeaser: StandardMetaTeaserSeed | null; format: 'standard' | 'wild'; hasFullAccess: boolean; teaserWaitsForAccess: boolean; accessPending: boolean;
}) {
  const openOffer = usePaidOffer() ?? undefined;
  return <StandardMetaPage embedded hasFullAccess={hasFullAccess} teaserWaitsForAccess={teaserWaitsForAccess} accessPending={accessPending}
    initialTeaser={initialTeaser} format={format} onPaidOffer={openOffer} />;
}

/**
 * One view for everyone: the guest's page is the subscriber's, on the open slice the server rendered, with the closed
 * parts locked in place. Access does not remount the page: the paid slice replaces the open one inside it.
 */
export function StandardMetaPageClient({ initialTeaser, format = 'standard' }: {
  initialTeaser: StandardMetaTeaserSeed | null; format?: 'standard' | 'wild';
}) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  const hydrated = useHydrated();
  // A browser holding a session is probably a subscriber's: its locks stay hidden until the check ends (never in server HTML).
  const remembered = hydrated && pending && sessionTag() !== null;
  return <PublicPageShell activeTab="standard-meta" pathname={format === 'wild' ? '/standard/meta/wild/' : '/standard/meta/'}
    access={access} navigate={navigate} wide>
    <PaidOfferProvider entitlement="standard" title={OFFER_TITLE} text={OFFER_TEXT}>
      <MetaView initialTeaser={initialTeaser} format={format} hasFullAccess={allowed}
        teaserWaitsForAccess={pending && sessionTag() !== null} accessPending={remembered} />
    </PaidOfferProvider>
  </PublicPageShell>;
}
