import { LockKeyhole } from 'lucide-react';
import '../../shared/ui/PaidLocks.css';

/**
 * A lock in the place of a closed value inside a control that is itself a button (a class bar filters the list):
 * the same look as `PaidMetricLock`, but not a button of its own, so the control stays one button.
 * It carries the page's closed-part class `paywalled-vicious-gold`, which the page's JSON-LD names (#655).
 */
export function LockMark({ label }: { label: string }) {
  return <span className="paid-lock vsgold-lock-mark paywalled-vicious-gold" role="img" aria-label={`${label}: по подписке`}>
    <LockKeyhole size={13} aria-hidden="true" />
  </span>;
}
