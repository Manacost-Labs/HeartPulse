'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import ViciousSyndicateGold from '@/src/features/ViciousSyndicateGold';
import { useHydrated } from '@/src/shared/ui/useHydrated';
import type { PublicViciousGold } from '@/shared/viciousGoldPublicContract';
import { PaidOfferProvider } from './PaidOffer';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';
import { sessionTag } from './viewerHint';

const NO_REFUSAL = { denied: false, checked: false, retried: false };

const OFFER_TITLE = 'Отчёт Vicious Syndicate Gold — по подписке';
const OFFER_TEXT = 'Доли классов и архетипов, Power Tier по рангам, лидеры отчёта и готовые колоды открываются подпиской.';

function GoldView({ open, hasFullAccess, accessPending, accessLost, onAccessDenied }: {
  open: PublicViciousGold | null; hasFullAccess: boolean; accessPending: boolean; accessLost: boolean; onAccessDenied: () => Promise<unknown>;
}) {
  // Access is raised in place (the paid report replaces the open frame), but when it is withdrawn (sign-out, an
  // expired subscription, a refused status check) the report restarts from the open frame in the same render: no
  // frame shows a paid number to a viewer without access. The paid route refusing the viewer (401/403) is a
  // withdrawal known before the access check answers: the page drops to the open frame at once (flushed) while the
  // check runs. If the check confirms access, the paid report is read once more; a second refusal keeps the open
  // frame until access is lost for good, so a refusing route cannot make a loop.
  const [guard, setGuard] = useState(NO_REFUSAL);
  const latest = useRef(guard);
  useEffect(() => { latest.current = guard; });
  if (accessLost && (guard.denied || guard.checked || guard.retried)) {
    setGuard(NO_REFUSAL);
  } else if (guard.denied && guard.checked && hasFullAccess) {
    setGuard({ denied: false, checked: false, retried: true });
  }
  const granted = hasFullAccess && !guard.denied;
  const [state, setState] = useState({ allowed: granted, epoch: 0 });
  if (state.allowed !== granted) setState({ allowed: granted, epoch: state.epoch + (state.allowed ? 1 : 0) });
  const refused = () => {
    const mayRetry = !latest.current.retried;
    flushSync(() => setGuard(current => ({ denied: true, checked: false, retried: current.retried })));
    if (mayRetry) void onAccessDenied().then(() => undefined, () => undefined).then(() => setGuard(current => ({ ...current, checked: true })));
  };
  return <ViciousSyndicateGold key={state.epoch} open={open} hasFullAccess={granted} accessPending={accessPending} onAccessDenied={refused} />;
}

/**
 * One view for everyone (#656): the guest's page is the subscriber's, on the open frame the server rendered, with
 * the closed values locked in place; a lock opens the Standard subscription offer. Access does not remount the
 * page: the paid report replaces the open frame inside it.
 */
export function ViciousGoldPageClient({ initialOpen }: { initialOpen: PublicViciousGold | null }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  const hydrated = useHydrated();
  // A browser holding a session is probably a subscriber's: its locks stay hidden until the check ends (never in server HTML).
  const remembered = hydrated && pending && sessionTag() !== null;
  return <PublicPageShell activeTab="standard-vicious-gold" pathname="/standard/vicious-gold/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} wide>
    <PaidOfferProvider entitlement="standard" title={OFFER_TITLE} text={OFFER_TEXT}>
      <GoldView open={initialOpen} hasFullAccess={allowed} accessPending={remembered} accessLost={!allowed && !pending}
        onAccessDenied={access.refresh} />
    </PaidOfferProvider>
  </PublicPageShell>;
}
