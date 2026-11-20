'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import StandardMetaPage from '@/src/features/StandardMeta';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';
import { PaidOfferProvider } from './PaidOffer';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { useHydrated } from '@/src/shared/ui/useHydrated';
import { navigate } from './navigation';
import { sessionTag } from './viewerHint';

const OFFER_TITLE = 'Узкие срезы, история и тренды — в подписке';
const OFFER_TEXT = 'Другие ранги и периоды, очерёдность хода, порог игр, ходы, длительность, скорость набора и динамика архетипов открываются подпиской.';

function MetaView({ initialTeaser, format, hasFullAccess, teaserWaitsForAccess, accessPending, onAccessDenied }: {
  initialTeaser: StandardMetaTeaserSeed | null; format: 'standard' | 'wild'; hasFullAccess: boolean; teaserWaitsForAccess: boolean; accessPending: boolean; onAccessDenied: () => void;
}) {
  // Access is raised in place (the paid slice replaces the open one), but when it is withdrawn (sign-out, an expired
  // subscription, a refused status check) the page restarts from the open slice in the same render: no frame shows
  // the paid slice, its rank, period or filters to a viewer without access.
  // The paid route refusing the viewer (401/403) is the same withdrawal, known before the access check answers: the page
  // drops to the open slice at once (flushed, no frame with the paid slice) and stays there until access is lost and regained.
  const [denied, setDenied] = useState(false);
  if (denied && !hasFullAccess) setDenied(false);
  const granted = hasFullAccess && !denied;
  const [state, setState] = useState({ allowed: granted, epoch: 0 });
  if (state.allowed !== granted) setState({ allowed: granted, epoch: state.epoch + (state.allowed ? 1 : 0) });
  const refused = () => { flushSync(() => setDenied(true)); onAccessDenied(); };
  return <StandardMetaPage key={state.epoch} embedded hasFullAccess={granted} teaserWaitsForAccess={teaserWaitsForAccess} accessPending={accessPending}
    initialTeaser={initialTeaser} format={format} onAccessDenied={refused} />;
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
        teaserWaitsForAccess={pending && sessionTag() !== null} accessPending={remembered} onAccessDenied={access.refresh} />
    </PaidOfferProvider>
  </PublicPageShell>;
}
