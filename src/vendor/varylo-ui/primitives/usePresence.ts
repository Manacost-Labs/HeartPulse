'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps an element mounted while its exit animation plays.
 * Render when `isMounted`; put `data-state={state}` on the element and
 * animate `[data-state='closed']` in CSS.
 */
export function usePresence(open: boolean, exitMs = 160) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, mounted, exitMs]);

  return {
    isMounted: open || mounted,
    state: (open ? 'open' : 'closed') as 'open' | 'closed',
  };
}
