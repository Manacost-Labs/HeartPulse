import { useEffect, useRef } from 'react';

// Another card starts at its top. Loading the same card again (the full
// detail after the server-rendered seed, a period or rank change) keeps the
// reader where they scrolled.
export function useScrollToTopOnCardChange(shownCardId: string | null) {
  const previousShownCardIdRef = useRef<string | null>(null);
  useEffect(() => {
    const previousCardId = previousShownCardIdRef.current;
    if (shownCardId) previousShownCardIdRef.current = shownCardId;
    if (!shownCardId || !previousCardId || previousCardId === shownCardId) return undefined;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    return () => cancelAnimationFrame(frame);
  }, [shownCardId]);
}
