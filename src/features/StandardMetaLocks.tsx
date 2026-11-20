import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { usePaidOffer } from '../shared/ui/paidOfferContext';
import { useHydrated } from '../shared/ui/useHydrated';

/**
 * Every lock of the meta page for a viewer without a subscription, in one place. A press opens the offer of the
 * nearest `PaidOfferProvider` (`paidOfferContext`); without one (a story) a lock is only a mark and does nothing.
 * They are not the shared chips of `PaidLocks.tsx`: those are wider than a table column and taller than a select
 * (44px against 48), and the guest's geometry must equal the subscriber's, so these stand in the box of the control
 * or of the line of the number they replace.
 */

const lockedLabel = (what: string) => `${what}: по подписке. Узнать, как открыть`;

/** A paid number's place in a guest's card or row: the box of the number, so nothing moves when it arrives. */
export function MetaLockedValue({ what }: { what: string }) {
  const onOpen = usePaidOffer();
  const hydrated = useHydrated();
  if (!onOpen) return <span className="standard-meta__paid-value" title="В подписке"><Lock size={13} className="standard-meta__lock-mark" aria-label="В подписке" /></span>;
  return (
    <button type="button" className="standard-meta__paid-value paywalled-standard-meta" inert={!hydrated} onClick={onOpen} aria-label={lockedLabel(what)}>
      <Lock size={13} className="standard-meta__lock-mark" aria-hidden="true" />
    </button>
  );
}

/** A paid filter of the page: the open slice's value behind a lock. */
export function MetaLockedFilter({ label, value }: { label: string; value: string }) {
  const onOpen = usePaidOffer();
  return (
    <button type="button" className="standard-meta__select standard-meta__locked-filter paywalled-standard-meta" onClick={() => onOpen?.()}
      aria-label={lockedLabel(`${label}, сейчас ${value}`)} data-locked-filter>
      <span className="standard-meta__control-label">{label}</span>
      <span className="standard-meta__locked-value"><Lock size={14} className="standard-meta__lock-mark" aria-hidden="true" />{value}</span>
    </button>
  );
}

/** A rank the guest cannot pick: the tab stays where it is, with a lock. */
export function MetaLockedRank({ label, children }: { label: string; children?: ReactNode }) {
  const onOpen = usePaidOffer();
  return (
    <button type="button" className="paywalled-standard-meta" aria-pressed={false} onClick={() => onOpen?.()} aria-label={lockedLabel(label)}>
      <Lock size={12} className="standard-meta__lock-mark" aria-hidden="true" />{children ?? label}
    </button>
  );
}

/** The place of a closed table column or the change of the win rate: one lock of the width of what it replaces. */
export function MetaLockedCell({ what, className }: { what: string; className?: string }) {
  const onOpen = usePaidOffer();
  const hydrated = useHydrated();
  const lock = <Lock size={13} className="standard-meta__lock-mark" aria-hidden="true" />;
  return onOpen
    ? <button type="button" className={`standard-meta-table__lock paywalled-standard-meta${className ? ` ${className}` : ''}`} inert={!hydrated} onClick={onOpen} aria-label={lockedLabel(what)}>{lock}</button>
    : <span className={`standard-meta-table__lock${className ? ` ${className}` : ''}`} title="В подписке">{lock}<span className="sr-only">В подписке</span></span>;
}
