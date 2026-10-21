'use client';

import { useCallback, useRef, type RefObject } from 'react';
import { animateSpring, type SpringName } from './spring';
import { useLayoutEffect } from './react-compat';

/** A box in the container's coordinates (so scrolling the page does not count as moving). */
export interface FlipBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FlipDelta {
  /** Offset from the new position back to the old one, px (centre to centre). */
  x: number;
  y: number;
  /** Old size over new size. */
  scaleX: number;
  scaleY: number;
}

/** How far an element moved between two measurements, or null when it stayed put. */
export function flipDelta(first: FlipBox, last: FlipBox): FlipDelta | null {
  const x = first.left + first.width / 2 - (last.left + last.width / 2);
  const y = first.top + first.height / 2 - (last.top + last.height / 2);
  const scaleX = last.width ? first.width / last.width : 1;
  const scaleY = last.height ? first.height / last.height : 1;
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01) return null;
  return { x, y, scaleX, scaleY };
}

export interface FlipOptions {
  /** Spring for the moves (default `snappy`). */
  spring?: SpringName;
  /** Off: nothing is measured or animated. */
  enabled?: boolean;
  /** Elements that appear with the change fade and scale in (default true). */
  animateEnter?: boolean;
  /**
   * Also animate changes that come from props (the parent re-renders with a new order or grouping): the
   * layout of every commit is remembered and the next one slides from it. Default: only after capture().
   */
  auto?: boolean;
}

const FLIP_ID = 'ui-flip';

function boxes(container: HTMLElement, elements: Iterable<HTMLElement>): Map<string, FlipBox> {
  const origin = container.getBoundingClientRect();
  const map = new Map<string, FlipBox>();
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    map.set(element.dataset.flipId ?? '', { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height });
  }
  return map;
}

/**
 * Layout animation for lists that reorder, regroup or expand (FLIP). Call the returned `capture()` right
 * before a state change (or pass `auto` for changes that arrive through props); after React re-renders,
 * every element marked `data-flip-id` inside `containerRef` slides from where it was to where it is now
 * on a spring. The slide uses the individual `translate` / `scale` properties, so it composes with the
 * element's own transform. React renders once per change, never per frame. Reduced motion: no slide.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, options: FlipOptions = {}) {
  const { spring = 'snappy', enabled = true, animateEnter = true, auto = false } = options;
  const snapshot = useRef<Map<string, FlipBox> | null>(null);
  const previous = useRef<Map<string, FlipBox> | null>(null);

  const capture = useCallback(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    // Visual positions, moves in flight included, so an interrupted move continues from where it is.
    snapshot.current = boxes(container, container.querySelectorAll<HTMLElement>('[data-flip-id]'));
  }, [containerRef, enabled]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const before = snapshot.current ?? (auto ? previous.current : null);
    snapshot.current = null;
    if (!container || !enabled) return;
    const elements = [...container.querySelectorAll<HTMLElement>('[data-flip-id]')];
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (before && !reduced) {
      // Measure the new layout without the moves still in flight.
      for (const element of elements) for (const running of element.getAnimations()) if (running.id === FLIP_ID) running.cancel();
    }
    const after = boxes(container, elements);
    if (auto) previous.current = after;
    if (!before || reduced) return;
    for (const element of elements) {
      const id = element.dataset.flipId ?? '';
      const first = before.get(id);
      const last = after.get(id);
      if (!last) continue;
      let move: Animation | undefined;
      if (!first) {
        if (animateEnter) move = animateSpring(element, { opacity: [0, 1], scale: ['0.85', '1'] }, spring);
      } else {
        const delta = flipDelta(first, last);
        if (!delta) continue;
        move = animateSpring(
          element,
          { translate: [`${delta.x}px ${delta.y}px`, '0px 0px'], scale: [`${delta.scaleX} ${delta.scaleY}`, '1 1'] },
          spring,
        );
      }
      if (move) move.id = FLIP_ID;
    }
  });

  return capture;
}
