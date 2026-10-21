'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { motionMs } from './motionTokens';

/** Mount times of the placeholders on screen now. */
const shownSince = new Set<number>();
let lastHiddenAt = Number.NEGATIVE_INFINITY;
/** A placeholder that replaces another within this long continues it. */
const HANDOVER_MS = 200;

/**
 * Keeps one loading state continuous. A placeholder fades in only after the
 * reveal delay, so a fast answer never flashes it; but a placeholder that
 * takes over from another one (an access check handing over to the page's
 * skeleton, a lazy chunk's reserve to its fitted skeleton) or joins a page
 * already showing one would blank out and fade in again, a visible blink.
 * Such a placeholder is marked `data-reveal="continued"` before its first
 * paint and appears at once (LoadingSurface.css). Server HTML is unmarked:
 * the attribute is set on the DOM node, outside React's props.
 */
export function useLoadingContinuity(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const now = performance.now();
    // A placeholder older than the reveal delay is visible.
    const reveal = motionMs('--motion-reveal-delay');
    const continued = now - lastHiddenAt < HANDOVER_MS || [...shownSince].some(since => now - since >= reveal);
    if (continued && ref.current) ref.current.dataset.reveal = 'continued';
    // A continued placeholder is visible from its first frame.
    const since = continued ? now - reveal : now;
    shownSince.add(since);
    return () => {
      shownSince.delete(since);
      lastHiddenAt = performance.now();
    };
  }, [ref]);
}
