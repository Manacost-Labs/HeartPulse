'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animateSpring, themeSlowMs } from './spring';
import { usePresence } from './usePresence';

/** Longest theme --ui-duration-slow (400 ms) plus a margin: a folding group stays mounted that long. */
const FOLD_MS = 450;

const FOLD_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** The theme's standard curve for an element (`--ui-ease`), as a Web Animations easing. */
function themeEase(element: Element) {
  const value = getComputedStyle(element).getPropertyValue('--ui-ease').trim();
  return value && (typeof CSS === 'undefined' || CSS.supports?.('transition-timing-function', value) !== false) ? value : FOLD_EASE;
}

/**
 * A disclosure's content (a tree branch, a JSON node) that unfolds and folds: height and fade, played
 * with Web Animations from the measured height, so the rows below glide instead of jumping. The group
 * stays mounted until the fold has played; render it while `isMounted`, with `ref`, `data-state={state}`
 * and `inert` when closed. `readyRef` is false during the owner's first commit, so groups open from the
 * start just show. `spring`: unfolds on the smooth spring; otherwise on the theme's curve and duration.
 * Durations follow --ui-duration-slow, so the themes' reduced-motion block (1 ms) makes it instant.
 */
export function useFold<T extends HTMLElement>(open: boolean, readyRef: RefObject<boolean>, spring = false) {
  const { isMounted, state } = usePresence(open, FOLD_MS);
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group || !readyRef.current || typeof group.animate !== 'function') return;
    const height = `${group.scrollHeight}px`;
    // A group reopened mid-fold drops the fold (it fills forwards) before unfolding.
    for (const running of group.getAnimations()) running.cancel();
    // Clipped only while it moves: open, the rows' focus rings may reach past the group.
    group.style.overflow = 'hidden';
    const settle = (animation: Animation | undefined) =>
      animation?.finished.then(
        () => {
          if (state === 'open') group.style.overflow = '';
        },
        () => {},
      );
    if (state === 'open') {
      const keyframes = { height: ['0px', height], opacity: [0, 1] };
      settle(
        spring
          ? animateSpring(group, keyframes, 'smooth')
          : group.animate(keyframes, { duration: themeSlowMs(group), easing: themeEase(group) }),
      );
    } else {
      group.animate({ height: [height, '0px'], opacity: [1, 0] }, { duration: themeSlowMs(group), easing: FOLD_EASE, fill: 'forwards' });
    }
  }, [state, readyRef, spring]);

  return { ref, isMounted, state };
}
