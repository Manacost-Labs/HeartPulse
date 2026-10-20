import { useEffect, useState } from 'react';
import { motionMs } from './motionTokens';

type Phase = 'idle' | 'pending' | 'done';

/**
 * Delayed feedback reserves no layout space and never blocks another destination.
 * A navigation shorter than `--motion-base` shows nothing; a shown bar grows
 * while the route loads, then fills and fades (`NavigationProgress.css`).
 */
export function NavigationProgress({ pending }: { pending: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  useEffect(() => {
    if (!pending) { setPhase(current => current === 'pending' ? 'done' : current); return; }
    // A fading bar is dropped, so the next one grows from the start again.
    setPhase(current => current === 'done' ? 'idle' : current);
    const timer = setTimeout(() => setPhase('pending'), motionMs('--motion-base'));
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (phase !== 'done') return;
    // The fill and the fade of the `done` state, in sequence.
    const timer = setTimeout(() => setPhase(current => current === 'done' ? 'idle' : current),
      motionMs('--motion-instant') + motionMs('--motion-fast'));
    return () => clearTimeout(timer);
  }, [phase]);
  const active = pending && phase === 'pending';
  return <div className="navigation-progress" role="status" aria-live="polite" aria-atomic="true"
    data-navigation-progress={active ? 'pending' : phase === 'idle' ? 'idle' : 'done'}>
    {active ? 'Открываем страницу…' : ''}
  </div>;
}
