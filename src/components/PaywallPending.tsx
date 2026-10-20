import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import './PaywallGate.css';

/**
 * Stands in for a full-page gate while the viewer's access is still being
 * checked. It reserves the gate's height (`.arena-paywall-pending`), so the
 * footer stays put whichever of the gate or the paid page replaces it, and it
 * never holds paid data. Not `.arena-paywall`: QA and the production observer
 * read that class as "the gate has rendered".
 */
export default function PaywallPending({ children, className }: { children: ReactNode; className?: string }) {
  return <div className="arena-paywall-pending" role="status">
    <p className={className} aria-busy="true">{children}</p>
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
