import { useEffect, useState } from 'react';

type Phase = 'idle' | 'pending' | 'done';

/**
 * Delayed feedback reserves no layout space and never blocks another destination.
 * A shown bar grows while the route loads, then fills and fades instead of vanishing.
 */
export function NavigationProgress({ pending }: { pending: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  useEffect(() => {
    if (!pending) { setPhase(current => current === 'pending' ? 'done' : current); return; }
    // A fading bar is dropped, so the next one grows from the start again.
    setPhase(current => current === 'done' ? 'idle' : current);
    const timer = setTimeout(() => setPhase('pending'), 200);
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => setPhase(current => current === 'done' ? 'idle' : current), 400);
    return () => clearTimeout(timer);
  }, [phase]);
  const active = pending && phase === 'pending';
  return <div className="navigation-progress" role="status" aria-live="polite" aria-atomic="true"
    data-navigation-progress={active ? 'pending' : phase === 'idle' ? 'idle' : 'done'}>
    {active ? 'Открываем страницу…' : ''}
  </div>;
}
