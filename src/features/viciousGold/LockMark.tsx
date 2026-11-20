import { LockKeyhole } from 'lucide-react';
import '../../shared/ui/PaidLocks.css';

/**
 * A lock in the place of a closed value inside a control that is itself a button (a class bar filters the list):
 * the same look as `PaidMetricLock`, but not a button of its own, so the control stays one button.
 */
export function LockMark({ label }: { label: string }) {
  return <span className="paid-lock vsgold-lock-mark" role="img" aria-label={`${label}: по подписке`}>
    <LockKeyhole size={13} aria-hidden="true" />
  </span>;
}
