'use client';

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { inlineArrowStep, type Direction } from '../primitives';

export interface IndicatorRect {
  left: number;
  width: number;
  top: number;
  height: number;
  /** A resize moved it, not a new active item: it jumps (`transition: none`) instead of trailing behind. */
  instant: boolean;
}

/**
 * Measures the `[data-active="true"]` child of `listRef` (or the element `selector` finds) so a sliding
 * indicator (underline, thumb) can be positioned under it. The list must be
 * `position: relative` so offsetLeft is relative to it. offsetLeft is physical
 * in RTL too, so the indicator is placed with `left: 0` + translateX.
 */
export function useSlidingIndicator(
  listRef: RefObject<HTMLElement | null>,
  activeKey: unknown,
  selector = ':scope > [data-active="true"]',
) {
  const [rect, setRect] = useState<IndicatorRect | null>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = (instant: boolean) => {
      const active = list.querySelector<HTMLElement>(selector);
      const next = active
        ? { left: active.offsetLeft, width: active.offsetWidth, top: active.offsetTop, height: active.offsetHeight, instant }
        : null;
      setRect((prev) =>
        prev && next && prev.left === next.left && prev.width === next.width && prev.top === next.top && prev.height === next.height
          ? prev
          : next,
      );
    };
    measure(false);
    // A resize right after a switch (the new item turning bold) is part of the slide, not a jump; after
    // mount (a webfont swapping in) there is nothing to slide from.
    const changedAt = mounted.current ? performance.now() : -Infinity;
    mounted.current = true;
    // Children are observed too: a badge or font swap can resize one item without resizing the list.
    const observer = new ResizeObserver(() => measure(performance.now() - changedAt > 400));
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    return () => observer.disconnect();
  }, [listRef, activeKey, selector]);

  return rect;
}

/**
 * Marks a horizontally scrolling list with `data-fade-start` / `data-fade-end`
 * while content is hidden past that edge, so CSS can fade the edge as a hint.
 * Written straight to the DOM: scrolling must not re-render the list.
 */
export function useScrollEdges(listRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const max = list.scrollWidth - list.clientWidth;
      // scrollLeft is negative in RTL, so compare magnitudes.
      const offset = Math.abs(list.scrollLeft);
      list.toggleAttribute('data-fade-start', offset > 1);
      list.toggleAttribute('data-fade-end', offset < max - 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    list.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', update);
    };
  }, [listRef]);
}

/**
 * The vertical twin of useScrollEdges: marks a vertically scrolling `list` with `data-fade-top` /
 * `data-fade-bottom` while content is hidden past that edge. `contentKey` re-runs it when the children
 * change (new ones are observed for size too).
 */
export function useVerticalScrollEdges(listRef: RefObject<HTMLElement | null>, contentKey?: unknown) {
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const max = list.scrollHeight - list.clientHeight;
      list.toggleAttribute('data-fade-top', list.scrollTop > 1);
      list.toggleAttribute('data-fade-bottom', list.scrollTop < max - 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    list.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', update);
    };
  }, [listRef, contentKey]);
}

/**
 * For a row that turns into a scroll container only while its content is too wide, so focus rings and
 * touch targets stay unclipped whenever everything fits. Sets `data-overflow="true"` while the content
 * overflows (CSS switches on `overflow-x: auto` and the mask from it) and `"false"` otherwise, so CSS
 * can also tell markup without script (no attribute: e.g. server-rendered, not hydrated yet), plus the
 * same `data-fade-start` / `data-fade-end` edges as useScrollEdges. Each time the row starts to
 * overflow, the child matching `reveal` (the selected segment, the current page) is scrolled into view.
 * `contentKey` re-measures after the content changes without the row itself resizing.
 */
export function useOverflowScroll(listRef: RefObject<HTMLElement | null>, contentKey: unknown, reveal?: string) {
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let overflowing = false;
    const update = () => {
      // Opt out of the script-less layout (it may wrap) before measuring the one-line row.
      if (!list.hasAttribute('data-overflow')) list.setAttribute('data-overflow', 'false');
      // An overflow: visible box still reports its content's full scrollWidth.
      const max = list.scrollWidth - list.clientWidth;
      const next = max > 1;
      // Written only on a change: this runs on every scroll event.
      if (list.getAttribute('data-overflow') !== String(next)) list.setAttribute('data-overflow', String(next));
      const offset = Math.abs(list.scrollLeft);
      list.toggleAttribute('data-fade-start', next && offset > 1);
      list.toggleAttribute('data-fade-end', next && offset < max - 1);
      if (next && !overflowing && reveal) {
        const target = list.querySelector<HTMLElement>(reveal);
        if (target) revealInList(list, target);
      }
      overflowing = next;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    list.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', update);
    };
  }, [listRef, contentKey, reveal]);
}

/**
 * Scrolls `child` into view inside a horizontally scrolling `list` without touching the page scroll.
 * Measured on screen, so it works in RTL too (scrollLeft runs negative there, but a delta is physical).
 */
export function revealInList(list: HTMLElement, child: HTMLElement, margin = 24) {
  const viewStart = list.getBoundingClientRect().left + list.clientLeft;
  const viewEnd = viewStart + list.clientWidth;
  const rect = child.getBoundingClientRect();
  if (rect.left - margin < viewStart) list.scrollLeft -= viewStart - (rect.left - margin);
  else if (rect.right + margin > viewEnd) list.scrollLeft += rect.right + margin - viewEnd;
}

/**
 * Returns a filter for row `onPointerMove` handlers. Browsers replay a
 * pointermove at the resting cursor when a list scrolls under it (keyboard
 * navigation does that); only a real move may steal the highlight.
 */
export function usePointerMoved() {
  const last = useRef({ x: NaN, y: NaN });
  return (event: PointerEvent) => {
    const { x, y } = last.current;
    last.current = { x: event.clientX, y: event.clientY };
    return event.clientX !== x || event.clientY !== y;
  };
}

/** Next enabled index from `from` in direction `delta`, wrapping around; `from` itself when none. */
export function stepIndex(count: number, from: number, delta: 1 | -1, isDisabled: (index: number) => boolean) {
  for (let i = 1; i <= count; i++) {
    const next = (((from + delta * i) % count) + count) % count;
    if (!isDisabled(next)) return next;
  }
  return from;
}

/** Index targeted by a roving-focus key (arrows, Home, End), or null for other keys. Left/Right swap in RTL. */
export function rovingTarget(
  key: string,
  count: number,
  from: number,
  isDisabled: (index: number) => boolean,
  orientation: 'horizontal' | 'both' = 'horizontal',
  direction: Direction = 'ltr',
) {
  const inline = inlineArrowStep(key, direction);
  const prev = inline === -1 || (orientation === 'both' && key === 'ArrowUp');
  const next = inline === 1 || (orientation === 'both' && key === 'ArrowDown');
  if (prev) return stepIndex(count, from, -1, isDisabled);
  if (next) return stepIndex(count, from, 1, isDisabled);
  if (key === 'Home') return stepIndex(count, -1, 1, isDisabled);
  if (key === 'End') return stepIndex(count, count, -1, isDisabled);
  return null;
}
