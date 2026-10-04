import type { ReactNode } from 'react';
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
