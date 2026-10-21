'use client';

import { useCallback, useLayoutEffect, useRef, useState, type Ref, type RefCallback, type RefObject } from 'react';

type ClassValue = string | number | false | null | undefined;

/** Joins truthy class names. */
export function cx(...values: ClassValue[]): string {
  let out = '';
  for (const v of values) {
    if (v) out = out ? `${out} ${v}` : String(v);
  }
  return out;
}

/**
 * Combines several refs (callback or object) into one callback ref. Always returns a cleanup, so every ref
 * is detached on unmount: React 19 calls only the cleanup (never the callback with null) once one is returned.
 */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    const cleanups: (() => void)[] = [];
    for (const ref of refs) {
      if (typeof ref === 'function') {
        const cleanup = ref(node);
        cleanups.push(typeof cleanup === 'function' ? cleanup : () => ref(null));
      } else if (ref) {
        ref.current = node;
        cleanups.push(() => {
          ref.current = null;
        });
      }
    }
    return () => cleanups.forEach((fn) => fn());
  };
}

/** Calls the user handler first; skips ours when the user called preventDefault(). */
export function composeHandlers<E extends { defaultPrevented?: boolean }>(
  theirs: ((event: E) => void) | undefined,
  ours: (event: E) => void,
) {
  return (event: E) => {
    theirs?.(event);
    if (!event.defaultPrevented) ours(event);
  };
}

/** Ref that always holds the latest value — for stable callbacks in effects. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Stable function identity that always calls the latest implementation. */
export function useEventCallback<A extends unknown[], R>(fn: (...args: A) => R) {
  const ref = useLatest(fn);
  return useCallback((...args: A) => ref.current(...args), [ref]);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export type Direction = 'ltr' | 'rtl';

/** Writing direction at `element`, read from CSS so it follows `dir` on any ancestor (portaled layers inherit <html dir>). */
export function getDirection(element: Element | null | undefined): Direction {
  return element && getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
}

/**
 * A horizontal arrow key as a logical step along the inline axis: 1 towards the end
 * (ArrowRight in LTR, ArrowLeft in RTL), -1 towards the start, 0 for any other key.
 */
export function inlineArrowStep(key: string, direction: Direction): -1 | 0 | 1 {
  if (key === 'ArrowRight') return direction === 'rtl' ? -1 : 1;
  if (key === 'ArrowLeft') return direction === 'rtl' ? 1 : -1;
  return 0;
}

/**
 * True while an IME (Japanese, Chinese, Korean input) is composing: the key belongs to the conversion
 * (Enter confirms it, arrows pick a candidate), so a field must not treat it as its own shortcut.
 * Takes a React or a DOM keyboard event. keyCode 229: Safari reports the composition's last keydown
 * with isComposing false.
 */
export function isComposingKey(event: { nativeEvent?: { isComposing?: boolean }; isComposing?: boolean; keyCode?: number }) {
  return event.nativeEvent?.isComposing === true || event.isComposing === true || event.keyCode === 229;
}

/**
 * Direction of the element in `ref`, re-read after each render so a changed `dir` is picked up.
 * For choosing physical placements (a "right" flyout becomes "left" in RTL).
 */
export function useDirection(ref: RefObject<Element | null>): Direction {
  const [direction, setDirection] = useState<Direction>('ltr');
  useLayoutEffect(() => setDirection(getDirection(ref.current)));
  return direction;
}
