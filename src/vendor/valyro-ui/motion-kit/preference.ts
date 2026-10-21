'use client';

/*
 * One switch for all motion. Motion is reduced when the OS asks for it (prefers-reduced-motion) or when
 * `data-ui-motion="reduce"` sits on <html> or on any ancestor. styles/motion.css makes the CSS side
 * instant under the attribute; everything that moves from JS asks isMotionReduced() or the hooks here.
 * SSR-safe: nothing touches window or document before an effect or a subscription runs.
 */
import { useEffect, useState, type RefObject } from 'react';
import { useSyncExternalStore } from '../primitives/react-compat';
import { isMotionReduced } from '../primitives/utils';

// In primitives, so the free core components ask the same question without importing this Pro module.
export { isMotionReduced };

/** The attribute that reduces motion for an element and everything inside it. */
export const MOTION_ATTRIBUTE = 'data-ui-motion';

const QUERY = '(prefers-reduced-motion: reduce)';

/** `reduce` — no motion on the page (or inside `target`); `user` — follow the OS setting. */
export type MotionPreference = 'reduce' | 'user';

/** Turns motion off for the page (or for `target` and everything inside it), or back to the OS setting. */
export function setMotionPreference(preference: MotionPreference, target?: Element) {
  const element = target ?? document.documentElement;
  if (preference === 'reduce') element.setAttribute(MOTION_ATTRIBUTE, 'reduce');
  else element.removeAttribute(MOTION_ATTRIBUTE);
}

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let media: MediaQueryList | undefined;
const notify = () => listeners.forEach((listener) => listener());

/** Calls `listener` when the page-wide preference changes (the OS setting or the attribute on <html>). */
export function subscribeMotionPreference(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(notify);
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: [MOTION_ATTRIBUTE] });
    media = window.matchMedia?.(QUERY);
    media?.addEventListener?.('change', notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    observer?.disconnect();
    observer = null;
    media?.removeEventListener?.('change', notify);
    media = undefined;
  };
}

/**
 * Calls `onChange(reduced)` when the preference for `element` changes: the OS setting, or the attribute
 * on the element or any ancestor. Returns the cleanup.
 */
export function watchMotionPreference(element: Element, onChange: (reduced: boolean) => void): () => void {
  let last = isMotionReduced(element);
  const check = () => {
    const next = isMotionReduced(element);
    if (next === last) return;
    last = next;
    onChange(next);
  };
  const ancestors = typeof MutationObserver === 'undefined' ? null : new MutationObserver(check);
  for (let node: Element | null = element; node; node = node.parentElement) {
    ancestors?.observe(node, { attributes: true, attributeFilter: [MOTION_ATTRIBUTE] });
  }
  const stop = subscribeMotionPreference(check);
  return () => {
    ancestors?.disconnect();
    stop();
  };
}

const pageReduced = () => isMotionReduced(null);
const serverReduced = () => false;

/**
 * Live "is motion reduced": page-wide, and for the element in `ref` when given (an ancestor's
 * `data-ui-motion`). False on the server and during hydration, so server and client markup match.
 */
export function useMotionReduced(ref?: RefObject<Element | null>): boolean {
  const page = useSyncExternalStore(subscribeMotionPreference, pageReduced, serverReduced);
  const [scoped, setScoped] = useState(false);
  useEffect(() => {
    const element = ref?.current;
    if (!element) return;
    setScoped(isMotionReduced(element));
    return watchMotionPreference(element, setScoped);
  }, [ref]);
  return page || scoped;
}
