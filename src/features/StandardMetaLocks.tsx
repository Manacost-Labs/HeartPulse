import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useHydrated } from '../shared/ui/useHydrated';

/**
 * Every lock of the meta page for a viewer without a subscription, in one place. `onOpen` is the page's
 * subscription offer; without it (a story, a page with no offer) a lock is only a mark and does nothing.
 */
export type OpenPaidOffer = (() => void) | undefined;

const lockedLabel = (what: string) => `${what}: по подписке. Узнать, как открыть`;

/** A paid number's place in a guest's card or row: the box of the number, so nothing moves when it arrives. */
export function MetaLockedValue({ what, onOpen }: { what: string; onOpen: OpenPaidOffer }) {
  const hydrated = useHydrated();
  if (!onOpen) return <span className="standard-meta__paid-value" title="В подписке"><Lock size={13} className="standard-meta__lock-mark" aria-label="В подписке" /></span>;
  return (
    <button type="button" className="standard-meta__paid-value paywalled-standard-meta" inert={!hydrated} onClick={onOpen} aria-label={lockedLabel(what)}>
      <Lock size={13} className="standard-meta__lock-mark" aria-hidden="true" />
    </button>
  );
}

/** A paid filter of the page: the open slice's value behind a lock. */
export function MetaLockedFilter({ label, value, onOpen }: { label: string; value: string; onOpen: OpenPaidOffer }) {
  return (
    <button type="button" className="standard-meta__select standard-meta__locked-filter paywalled-standard-meta" onClick={onOpen}
      aria-label={lockedLabel(`${label}, сейчас ${value}`)} data-locked-filter>
      <span className="standard-meta__control-label">{label}</span>
      <span className="standard-meta__locked-value"><Lock size={14} className="standard-meta__lock-mark" aria-hidden="true" />{value}</span>
    </button>
  );
}

/** A rank the guest cannot pick: the tab stays where it is, with a lock. */
export function MetaLockedRank({ label, onOpen, children }: { label: string; onOpen: OpenPaidOffer; children?: ReactNode }) {
  return (
    <button type="button" className="paywalled-standard-meta" aria-pressed={false} onClick={onOpen} aria-label={lockedLabel(label)}>
      <Lock size={12} className="standard-meta__lock-mark" aria-hidden="true" />{children ?? label}
    </button>
  );
}

/** The place of a closed table column or the change of the win rate: one lock of the width of what it replaces. */
export function MetaLockedCell({ what, onOpen, className }: { what: string; onOpen: OpenPaidOffer; className?: string }) {
  const hydrated = useHydrated();
  const lock = <Lock size={13} className="standard-meta__lock-mark" aria-hidden="true" />;
  return onOpen
    ? <button type="button" className={`standard-meta-table__lock paywalled-standard-meta${className ? ` ${className}` : ''}`} inert={!hydrated} onClick={onOpen} aria-label={lockedLabel(what)}>{lock}</button>
    : <span className={`standard-meta-table__lock${className ? ` ${className}` : ''}`} title="В подписке">{lock}<span className="sr-only">В подписке</span></span>;
}
