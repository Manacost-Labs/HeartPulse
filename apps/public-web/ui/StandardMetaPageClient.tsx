'use client';

import { useRef, useState } from 'react';
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

function MetaView({ initialTeaser, format, hasFullAccess, teaserWaitsForAccess, accessPending, accessLost, onAccessDenied }: {
  initialTeaser: StandardMetaTeaserSeed | null; format: 'standard' | 'wild'; hasFullAccess: boolean; teaserWaitsForAccess: boolean; accessPending: boolean; accessLost: boolean; onAccessDenied: () => Promise<unknown>;
}) {
  // Access is raised in place (the paid slice replaces the open one), but when it is withdrawn (sign-out, an expired
  // subscription, a refused status check) the page restarts from the open slice in the same render: no frame shows
  // the paid slice, its rank, period or filters to a viewer without access.
  // The paid route refusing the viewer (401/403) is a withdrawal known before the access check answers: the page drops to
  // the open slice at once (flushed: no frame with the paid slice) while the check runs. If the check confirms access, the
  // paid request is made once more and its answer replaces the open slice in place; a second refusal (or a check that does
  // not confirm) keeps the guest's view until access is lost for good, so a refusing route cannot make a loop.
  const [guard, setGuard] = useState({ denied: false, checked: false });
  const retried = useRef(false);
  if (accessLost && (guard.denied || guard.checked || retried.current)) {
    retried.current = false;
    setGuard({ denied: false, checked: false });
  } else if (guard.denied && guard.checked && hasFullAccess) {
    retried.current = true;
    setGuard({ denied: false, checked: false });
  }
  const granted = hasFullAccess && !guard.denied;
  const [state, setState] = useState({ allowed: granted, epoch: 0 });
  if (state.allowed !== granted) setState({ allowed: granted, epoch: state.epoch + (state.allowed ? 1 : 0) });
  const refused = () => {
    const mayRetry = !retried.current;
    flushSync(() => setGuard({ denied: true, checked: false }));
    if (mayRetry) void onAccessDenied().then(() => undefined, () => undefined).then(() => setGuard(current => ({ ...current, checked: true })));
  };
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
        teaserWaitsForAccess={pending && sessionTag() !== null} accessPending={remembered} accessLost={!allowed && !pending} onAccessDenied={access.refresh} />
    </PaidOfferProvider>
  </PublicPageShell>;
}
