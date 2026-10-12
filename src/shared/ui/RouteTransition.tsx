import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { settleContent } from './settleContent';

/**
 * Settles the marked content after a committed route change. The first paint
 * stays untouched; children retain their identity and are never held for motion.
 */
export function RouteTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const previousKey = useRef(routeKey);
  useLayoutEffect(() => {
    if (previousKey.current === routeKey) return;
    previousKey.current = routeKey;
    const content = root.current?.querySelector<HTMLElement>('[data-route-content]');
    if (!content) return;
    const animation = settleContent(content);
    return () => animation?.cancel();
  }, [routeKey]);
  return <div ref={root} style={{ display: 'contents' }}>{children}</div>;
}
