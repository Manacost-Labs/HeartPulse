import { useEffect, useState } from 'react';
import './NavigationProgress.css';

/** Delayed feedback reserves no layout space and never blocks another destination. */
export function NavigationProgress({ pending }: { pending: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!pending) { setVisible(false); return; }
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, [pending]);
  const active = pending && visible;
  return <div className="navigation-progress" role="status" aria-live="polite" aria-atomic="true"
    data-navigation-progress={active ? 'pending' : 'idle'}>
    {active ? 'Открываем страницу…' : ''}
  </div>;
}
