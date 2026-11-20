'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { OfferContext, usePaidOffer } from '@/src/shared/ui/paidOfferContext';
import type { SubscriptionEntitlementKey } from '@/src/modules/subscriptions/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';

const ArenaPaidOffer = lazy(() => import('./ArenaPaidOffer').then(module => ({ default: module.ArenaPaidOffer })));

export { usePaidOffer };

/**
 * Owns the subscription offer of a page whose open data carries locks
 * (`PaidLockButton`). The offer's code loads on the first tap. It closes by
 * itself once the viewer turns out to have access.
 */
export function PaidOfferProvider({ title, text, entitlement = 'arena', children }: {
  title: string; text: string; entitlement?: SubscriptionEntitlementKey; children: ReactNode;
}) {
  const access = usePublicAccess();
  const { allowed } = paidAccess(access, entitlement);
  const [shown, setShown] = useState(false);
  const open = useCallback(() => setShown(true), []);
  useEffect(() => { if (allowed) setShown(false); }, [allowed]);
  const returnTo = shown ? `${window.location.pathname}${window.location.search}` : '/';
  return <OfferContext.Provider value={useMemo(() => open, [open])}>
    {children}
    {shown && !allowed && <Suspense fallback={null}>
      <ArenaPaidOffer title={title} text={text} returnTo={returnTo} signedIn={Boolean(access.user)}
        checking={access.checking} onRefresh={access.refresh} onClose={() => setShown(false)} />
    </Suspense>}
  </OfferContext.Provider>;
}

/**
 * A lock in the open data: names what is closed and opens the offer. Without
 * the provider (or a script) it does nothing, and the data stays readable. A press does not bubble,
 * so the lock can sit in a clickable row.
 * `paywalled-*` is the class the page's JSON-LD names as the closed part.
 */
export function PaidLockButton({ className, label, closed, children }: {
  className: string;
  /** What the lock closes, for a screen reader: «Остальные показатели». */
  label: string;
  closed: 'paywalled-tierlist' | 'paywalled-classes' | 'paywalled-guides' | 'paywalled-standard-meta' | 'paywalled-archetype';
  children?: ReactNode;
}) {
  const open = usePaidOffer();
  return <button type="button" className={`${className} ${closed}`} onClick={event => { event.stopPropagation(); open?.(); }}
    aria-label={`${label}: по подписке. Узнать, как открыть`}>
    <LockKeyhole size={13} aria-hidden="true" />{children}
  </button>;
}
