'use client';

import { LockKeyhole } from 'lucide-react';
import { PaidLockButton } from './PaidOffer';
import './PaidLocks.css';

/**
 * Shared locks for the guest view: a guest sees the subscriber's interface, and a paid figure or filter
 * stays in its place as a lock instead of being replaced by a simpler layout.
 *
 * A lock never carries the paid value (the server markup has only the caption «По подписке»). A press
 * opens the subscription offer of the nearest `PaidOfferProvider` (same context and `returnTo`, no
 * inline `PaywallGate`); `onOpen` overrides it. Without a provider the press does nothing.
 * Built on `PaidLockButton`; once `usePaidOffer` is exported from `PaidOffer.tsx` (#611), the
 * `onOpen` path can pass it.
 *
 * ```tsx
 * <PaidOfferProvider title="…" text="…">
 *   <td><PaidMetricLock label="Винрейт против класса" /></td>
 *   <div><PaidMetricLock variant="card" label="Игры" /></div>
 *   <PaidFilterLock label="Мана" value="Любая мана" icon="/assets/mana-64.webp" />
 * </PaidOfferProvider>
 * ```
 */
interface LockProps {
  /** Name of the closed figure or filter, for a screen reader: «Винрейт». */
  label: string;
  /** The page's closed-part class its JSON-LD names (`paywalled-tierlist`, `paywalled-classes`). */
  closed?: Closed;
  /** Replaces the offer of the provider (for code outside it). */
  onOpen?: () => void;
}

const join = (...names: Array<string | undefined>) => names.filter(Boolean).join(' ');
const DEFAULT_CLOSED = 'paywalled-tierlist';
type Closed = 'paywalled-tierlist' | 'paywalled-classes';

/** A paid figure: «По подписке» with a lock in place of the value; `cell` for a table, `card` for a tile. */
export function PaidMetricLock({ label, variant = 'cell', closed = DEFAULT_CLOSED, onOpen }: LockProps & { variant?: 'cell' | 'card' }) {
  const className = join('paid-lock', variant === 'card' ? 'paid-lock--card' : undefined);
  if (!onOpen) {
    return <PaidLockButton className={className} label={label} closed={closed}><span>По подписке</span></PaidLockButton>;
  }
  return <button type="button" className={join(className, closed)} aria-label={`${label}: по подписке. Узнать, как открыть`}
    onClick={event => { event.stopPropagation(); onOpen(); }}>
    <LockKeyhole size={13} aria-hidden="true" /><span>По подписке</span>
  </button>;
}

/** A paid filter or button of the filter panel: stays in place with its default value, a press opens the offer. */
export function PaidFilterLock({ label, value, icon, closed = DEFAULT_CLOSED, onOpen }: LockProps & {
  /** What the open filter shows without a choice: «Любая мана». */
  value: string;
  /** Optional icon of the filter, decorative. */
  icon?: string;
}) {
  const content = <>
    <span>{label}</span>
    {icon ? <img src={icon} alt="" draggable={false} /> : null}
    <b>{value}</b>
  </>;
  if (!onOpen) return <PaidLockButton className="paid-filter-lock" label={`${label} (фильтр)`} closed={closed}>{content}</PaidLockButton>;
  return <button type="button" className={join('paid-filter-lock', closed)} aria-label={`${label} (фильтр): по подписке. Узнать, как открыть`}
    onClick={onOpen}>
    <LockKeyhole size={13} aria-hidden="true" />{content}
  </button>;
}
