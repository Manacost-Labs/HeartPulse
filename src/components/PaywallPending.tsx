import { useRef, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLoadingContinuity } from '../shared/ui/loadingContinuity';
import './PaywallGate.css';

/**
 * Stands in for a full-page gate while the viewer's access is still being
 * checked. It reserves the gate's height (`.arena-paywall-pending`), so the
 * footer stays put whichever of the gate or the paid page replaces it, and it
 * never holds paid data. Not `.arena-paywall`: QA and the production observer
 * read that class as "the gate has rendered".
 *
 * The status stays for assistive technology only. On screen the place of the
 * gate's plate fades in after the reveal delay as a silhouette in the gate's
 * frame and colour, with its eyebrow, title and lead as quiet bars: most visitors who wait here get that gate, and the
 * check's answer then fills the same box instead of replacing a line of text.
 * `plate={false}` keeps the plain caption, for a paid view's own chunk load.
 */
export default function PaywallPending({ children, className, plate = true }: {
  children: ReactNode; className?: string; plate?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLoadingContinuity(root);
  return <div ref={root} className="arena-paywall-pending" role="status">
    <p className={plate ? `sr-only ${className ?? ''}`.trim() : className} aria-busy="true">{children}</p>
    {plate ? <span className="arena-paywall-pending__plate" aria-hidden="true"><i /><i /><i /></span> : null}
  </div>;
}

/**
 * A failed access check, in the gate's place: what happened and a retry. It is
 * neither a grant nor a refusal, so it shows no lock and no subscription pitch.
 */
export function AccessUnavailable({ message, loading, onRetry }: {
  message?: string; loading: boolean; onRetry: () => Promise<unknown>;
}) {
  return (
    <section className="arena-paywall-pending arena-access-unavailable" role="alert">
      <p>{message || 'Не удалось проверить доступ.'}</p>
      <button type="button" onClick={() => { void onRetry(); }} disabled={loading}>
        <RefreshCw size={15} aria-hidden="true" />{loading ? 'Проверяем…' : 'Повторить проверку'}
      </button>
    </section>
  );
}
