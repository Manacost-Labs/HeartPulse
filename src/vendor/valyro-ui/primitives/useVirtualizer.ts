'use client';

import { useCallback, useMemo, useReducer, useRef, useState, type Key, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { clamp, useLatest } from './utils';
import { sharedCleanupRef, useLayoutEffect } from './react-compat';

/*
 * Windowing for long lists and grids: only the items in (or near) the viewport are rendered,
 * positioned absolutely inside a spacer of the full list size. Pure range math is exported for
 * tests; the hook wires it to a scroll element, ResizeObserver measuring and scroll anchoring.
 */

export type VirtualAlign = 'start' | 'center' | 'end' | 'auto';

export interface VirtualItem {
  index: number;
  key: Key;
  /** Offset from the start of the list, in px (padding included). */
  start: number;
  size: number;
  end: number;
}

/** Half-open index range: `start` inclusive, `end` exclusive. */
export interface VirtualRange {
  start: number;
  end: number;
}

export interface Measurements {
  count: number;
  starts: Float64Array;
  sizes: Float64Array;
  /** Length of the whole list: paddings, items and gaps. */
  total: number;
}

export interface MeasureOptions {
  paddingStart?: number;
  paddingEnd?: number;
  /** Space between items. */
  gap?: number;
}

/**
 * Item offsets from their sizes. With `prev` and `from`, offsets before `from` are copied from
 * `prev` (same count) and only the tail is recomputed — the cheap path after a few items were measured.
 */
export function computeMeasurements(
  count: number,
  sizeOf: (index: number) => number,
  { paddingStart = 0, paddingEnd = 0, gap = 0 }: MeasureOptions = {},
  prev?: Measurements,
  from = 0,
): Measurements {
  const reuse = prev && prev.count === count && from > 0 && from <= count;
  const starts = reuse ? prev.starts.slice() : new Float64Array(count);
  const sizes = reuse ? prev.sizes.slice() : new Float64Array(count);
  const first = reuse ? from : 0;
  let offset = first === 0 ? paddingStart : starts[first - 1] + sizes[first - 1] + gap;
  for (let i = first; i < count; i++) {
    const size = Math.max(0, sizeOf(i) || 0);
    starts[i] = offset;
    sizes[i] = size;
    offset += size + (i < count - 1 ? gap : 0);
  }
  return { count, starts, sizes, total: (count === 0 ? paddingStart : offset) + paddingEnd };
}

/** Index of the first item whose end lies past `offset` (`count` when there is none). */
export function findFirstAfter(m: Measurements, offset: number): number {
  let lo = 0;
  let hi = m.count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (m.starts[mid] + m.sizes[mid] > offset) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Items that intersect the viewport [offset, offset + viewport). */
export function getVisibleRange(m: Measurements, offset: number, viewport: number): VirtualRange {
  const start = findFirstAfter(m, offset);
  const limit = offset + Math.max(0, viewport);
  let lo = start;
  let hi = m.count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (m.starts[mid] >= limit) hi = mid;
    else lo = mid + 1;
  }
  return { start, end: Math.max(start, lo) };
}

/** Widens `range` by `overscan` items on both sides, within [0, count). */
export function withOverscan(range: VirtualRange, count: number, overscan: number): VirtualRange {
  const start = clamp(range.start - overscan, 0, count);
  return { start, end: clamp(range.end + overscan, start, count) };
}

export interface ScrollTargetOptions {
  align: VirtualAlign;
  /** Current scroll offset relative to the list start. */
  offset: number;
  viewport: number;
  /** Viewport space covered by sticky content at the start/end (a pinned header). */
  scrollPaddingStart?: number;
  scrollPaddingEnd?: number;
}

/**
 * List offset to scroll to so item `index` is aligned as asked, unclamped. `auto` scrolls the
 * least distance to reveal the item and returns null when it is already fully visible.
 */
export function getScrollTarget(
  m: Measurements,
  index: number,
  { align, offset, viewport, scrollPaddingStart = 0, scrollPaddingEnd = 0 }: ScrollTargetOptions,
): number | null {
  if (m.count === 0) return null;
  const i = clamp(Math.trunc(index), 0, m.count - 1);
  // The list's edge padding goes with the first and last item, so scrolling to them reaches the very ends.
  const start = i === 0 ? 0 : m.starts[i];
  const end = i === m.count - 1 ? m.total : m.starts[i] + m.sizes[i];
  const visibleStart = offset + scrollPaddingStart;
  const visibleEnd = offset + viewport - scrollPaddingEnd;
  const room = Math.max(0, visibleEnd - visibleStart);
  let mode = align;
  if (mode === 'auto') {
    if (start >= visibleStart && end <= visibleEnd) return null;
    mode = start < visibleStart || end - start > room ? 'start' : 'end';
  }
  if (mode === 'start') return start - scrollPaddingStart;
  if (mode === 'end') return end - viewport + scrollPaddingEnd;
  return start + (end - start) / 2 - scrollPaddingStart - room / 2;
}

/**
 * Where the anchor item went after the list changed: the same index when its key is still
 * there, or `index + inserted` when items were inserted before it. -1 when it cannot be traced.
 */
export function findAnchorIndex(
  anchor: { index: number; key: Key },
  prevCount: number,
  count: number,
  getKey: (index: number) => Key,
  followInserts: boolean,
): number {
  if (anchor.index < count && getKey(anchor.index) === anchor.key) return anchor.index;
  const inserted = count - prevCount;
  if (followInserts && inserted > 0) {
    const shifted = anchor.index + inserted;
    if (shifted < count && getKey(shifted) === anchor.key) return shifted;
  }
  return -1;
}

export interface VirtualizerOptions {
  count: number;
  /** The element that scrolls. The list may start further down inside it (see `scrollMargin`). */
  scrollRef: RefObject<HTMLElement | null>;
  /**
   * Item size in px. A number when every item has it; a function for estimates of items that are
   * measured with `measureElement` (or known sizes per index). Keep a function's identity stable
   * (useCallback): the offsets are rebuilt when it changes.
   */
  estimateSize: number | ((index: number) => number);
  /** Stable key per index, so measured sizes and the scroll anchor survive inserts. Default: the index. */
  getItemKey?: (index: number) => Key;
  horizontal?: boolean;
  /** Items rendered beyond each edge of the viewport. Default 4. */
  overscan?: number;
  paddingStart?: number;
  paddingEnd?: number;
  gap?: number;
  /** Distance from the start of the scroll content to the first item, e.g. a header rendered above the list. */
  scrollMargin?: number;
  /** Viewport space covered by sticky content; `scrollToIndex` keeps items clear of it. */
  scrollPaddingStart?: number;
  scrollPaddingEnd?: number;
  /** Viewport size assumed until the element is measured — what the server render and first client render show. Default 600. */
  initialSize?: number;
  /**
   * Keep what is on screen in place when items are inserted before it (loading older chat
   * messages). Off by default: a sorted or filtered list should not chase a row.
   */
  preserveScrollOnPrepend?: boolean;
}

export interface VirtualScrollOptions {
  align?: VirtualAlign;
  behavior?: ScrollBehavior;
}

export interface Virtualizer {
  /** Items to render (visible plus overscan), in order. */
  items: VirtualItem[];
  /** Indices actually in the viewport, without overscan. */
  range: VirtualRange;
  /** Size of the spacer that holds the items. */
  totalSize: number;
  /** Position of any index, rendered or not (e.g. to keep a focused row mounted). */
  getItem: (index: number) => VirtualItem | undefined;
  scrollToIndex: (index: number, options?: VirtualScrollOptions) => void;
  /** Scrolls to an offset relative to the list start. */
  scrollToOffset: (offset: number, options?: { behavior?: ScrollBehavior }) => void;
  /**
   * Ref callback for measured items. The element needs `data-index`; its border-box size is
   * read now and on every resize.
   */
  measureElement: (element: Element | null) => (() => void) | undefined;
}

interface ViewState {
  /** Scroll position of the element (not relative to the list). */
  scroll: number;
  viewport: number;
}

interface Anchor {
  index: number;
  key: Key;
  start: number;
  measurements: Measurements;
}

const defaultKey = (index: number): Key => index;
const MAX_SCROLL_CORRECTIONS = 10;

function readScroll(element: HTMLElement, horizontal: boolean) {
  // Math.abs: scrollLeft runs negative in right-to-left layouts.
  return horizontal ? Math.abs(element.scrollLeft) : element.scrollTop;
}

function readViewport(element: HTMLElement, horizontal: boolean) {
  return horizontal ? element.clientWidth : element.clientHeight;
}

function writeScroll(element: HTMLElement, horizontal: boolean, value: number, behavior: ScrollBehavior = 'auto') {
  if (!horizontal) {
    element.scrollTo({ top: value, behavior });
    return;
  }
  const rtl = getComputedStyle(element).direction === 'rtl';
  element.scrollTo({ left: rtl ? -value : value, behavior });
}

/** Windowed rendering for a scroll element; see `VirtualizerOptions`. SSR-safe: the first render shows `initialSize` worth of items. */
export function useVirtualizer({
  count,
  scrollRef,
  estimateSize,
  getItemKey = defaultKey,
  horizontal = false,
  overscan = 4,
  paddingStart = 0,
  paddingEnd = 0,
  gap = 0,
  scrollMargin = 0,
  scrollPaddingStart = 0,
  scrollPaddingEnd = 0,
  initialSize = 600,
  preserveScrollOnPrepend = false,
}: VirtualizerOptions): Virtualizer {
  const [view, setView] = useState<ViewState>({ scroll: 0, viewport: initialSize });
  const [version, bumpVersion] = useReducer((n: number) => n + 1, 0);
  const sizeCache = useRef(new Map<Key, number>());
  const dirtyFrom = useRef(Number.POSITIVE_INFINITY);
  const lastMeasurements = useRef<Measurements | null>(null);
  const pendingScroll = useRef<{ index: number; align: VirtualAlign; attempts: number } | null>(null);
  const anchor = useRef<Anchor | null>(null);
  const getKey = useLatest(getItemKey);

  const measurements = useMemo(() => {
    const estimate = typeof estimateSize === 'number' ? () => estimateSize : estimateSize;
    const cache = sizeCache.current;
    const sizeOf = cache.size === 0 ? estimate : (i: number) => cache.get(getItemKey(i)) ?? estimate(i);
    const prev = lastMeasurements.current;
    // Only measured sizes changed since the last build: recompute from the first changed item.
    const from = prev && prev.count === count && Number.isFinite(dirtyFrom.current) ? dirtyFrom.current : 0;
    const next = computeMeasurements(count, sizeOf, { paddingStart, paddingEnd, gap }, from > 0 ? prev ?? undefined : undefined, from);
    dirtyFrom.current = Number.POSITIVE_INFINITY;
    lastMeasurements.current = next;
    return next;
    // `version` is the signal that the size cache changed.
  }, [count, estimateSize, getItemKey, paddingStart, paddingEnd, gap, version]);

  const latest = useLatest({ measurements, horizontal, overscan, scrollMargin, scrollPaddingStart, scrollPaddingEnd });

  const visibleRange = (scroll: number, viewport: number, m: Measurements) =>
    getVisibleRange(m, scroll - latest.current.scrollMargin, viewport);

  /**
   * Remembers the first item that starts inside the viewport (or the one covering its top) and
   * where it sits, to hold it still when the list changes. A row cut off at the top is skipped:
   * it may be a transient one (a loading row) that is gone after the update.
   */
  const captureAnchor = (scroll: number) => {
    const m = latest.current.measurements;
    const offset = Math.max(0, scroll - latest.current.scrollMargin);
    let first = Math.min(findFirstAfter(m, offset), m.count - 1);
    if (first >= 0 && first < m.count - 1 && m.starts[first] < offset) first++;
    anchor.current = first >= 0 ? { index: first, key: getKey.current(first), start: m.starts[first], measurements: m } : null;
  };

  // Scroll and viewport tracking. Scroll events only re-render when the visible range changes.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const sync = () => {
      const next = { scroll: readScroll(element, horizontal), viewport: readViewport(element, horizontal) };
      captureAnchor(next.scroll);
      setView((prev) => {
        if (prev.viewport !== next.viewport) return next;
        const m = latest.current.measurements;
        const a = visibleRange(prev.scroll, prev.viewport, m);
        const b = visibleRange(next.scroll, next.viewport, m);
        return a.start === b.start && a.end === b.end ? prev : next;
      });
    };
    sync();
    // Rendering inside the scroll event keeps fast flicks from showing blank space for a frame.
    const onScroll = () => flushSync(sync);
    element.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
    // Everything else is read through `latest`, so options can change without re-subscribing.
  }, [scrollRef, horizontal]);

  const record = useCallback(
    (index: number, size: number) => {
      if (!(index >= 0)) return false;
      const key = getKey.current(index);
      const prev = sizeCache.current.get(key);
      if (prev !== undefined && Math.abs(prev - size) < 0.5) return false;
      sizeCache.current.set(key, size);
      dirtyFrom.current = Math.min(dirtyFrom.current, index);
      return true;
    },
    [getKey],
  );

  // Elements attached during the current commit; measured in the post-commit pass below, when
  // `getKey` already belongs to this render (ref callbacks run before `useLatest` catches up).
  const attached = useRef<Element[]>([]);
  const observerRef = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => () => observerRef.current?.disconnect(), []);
  const sizeOf = useCallback(
    (rect: { width: number; height: number }) => (latest.current.horizontal ? rect.width : rect.height),
    [latest],
  );

  const measureElement = useCallback(
    // Shared by every measured item: on React 17/18 the items that left are unobserved after the commit.
    sharedCleanupRef((element: Element) => {
      if (!element) return undefined;
      attached.current.push(element);
      observerRef.current ??= new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          // Detached elements report 0; their last size stays cached.
          if (!entry.target.isConnected) continue;
          const box = entry.borderBoxSize?.[0];
          const size = box
            ? sizeOf({ width: box.inlineSize, height: box.blockSize })
            : sizeOf(entry.target.getBoundingClientRect());
          if (record(Number(entry.target.getAttribute('data-index')), size)) changed = true;
        }
        if (changed) flushSync(bumpVersion);
      });
      const observer = observerRef.current;
      observer.observe(element);
      return () => observer.unobserve(element);
    }) as Virtualizer['measureElement'],
    [record, sizeOf],
  );

  // After every commit: apply sizes measured by ref callbacks (before paint), finish a pending
  // scrollToIndex once sizes settle, and keep the anchor item still when content above it changes.
  useLayoutEffect(() => {
    // Sizes of newly attached items go into the cache now and into the offsets on the re-render
    // this schedules; the anchor below is still placed with the offsets this commit rendered.
    let measured = false;
    for (const element of attached.current) {
      if (element.isConnected && record(Number(element.getAttribute('data-index')), sizeOf(element.getBoundingClientRect()))) {
        measured = true;
      }
    }
    attached.current = [];
    if (measured) bumpVersion();
    const element = scrollRef.current;
    if (!element) return;
    const m = measurements;
    const scroll = readScroll(element, horizontal);
    const listOffset = scroll - scrollMargin;
    const pending = pendingScroll.current;
    let target: number | null = null;
    if (pending && measured) {
      // Re-aim once the new sizes are in the offsets.
    } else if (pending) {
      const goal = getScrollTarget(m, pending.index, {
        align: pending.align,
        offset: listOffset,
        viewport: readViewport(element, horizontal),
        scrollPaddingStart,
        scrollPaddingEnd,
      });
      if (goal !== null && Math.abs(goal + scrollMargin - scroll) > 1 && pending.attempts < MAX_SCROLL_CORRECTIONS) {
        pending.attempts++;
        target = goal + scrollMargin;
      } else {
        pendingScroll.current = null;
      }
    } else {
      const prev = anchor.current;
      if (prev && prev.measurements !== m) {
        const index = findAnchorIndex(prev, prev.measurements.count, m.count, getKey.current, preserveScrollOnPrepend);
        const delta = index >= 0 ? m.starts[index] - prev.start : 0;
        if (Math.abs(delta) >= 0.5) target = scroll + delta;
      }
    }
    if (target !== null) {
      const max = (horizontal ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight) || 0;
      const clamped = clamp(target, 0, Math.max(0, max));
      writeScroll(element, horizontal, clamped);
      setView((prev) => (prev.scroll === clamped ? prev : { ...prev, scroll: clamped }));
    }
    captureAnchor(target ?? scroll);
  });

  const scrollToOffset = useCallback(
    (offset: number, { behavior = 'auto' }: { behavior?: ScrollBehavior } = {}) => {
      const element = scrollRef.current;
      if (!element) return;
      const { horizontal: h, scrollMargin: margin } = latest.current;
      const max = h ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight;
      const value = clamp(offset + margin, 0, Math.max(0, max));
      pendingScroll.current = null;
      writeScroll(element, h, value, behavior);
      if (behavior !== 'smooth') setView((prev) => (prev.scroll === value ? prev : { ...prev, scroll: value }));
    },
    [scrollRef, latest],
  );

  const scrollToIndex = useCallback(
    (index: number, { align = 'auto', behavior = 'auto' }: VirtualScrollOptions = {}) => {
      const element = scrollRef.current;
      const { measurements: m, horizontal: h, scrollMargin: margin, scrollPaddingStart: ps, scrollPaddingEnd: pe } = latest.current;
      if (!element || m.count === 0) return;
      const current = readScroll(element, h);
      const goal = getScrollTarget(m, index, {
        align,
        offset: current - margin,
        viewport: readViewport(element, h),
        scrollPaddingStart: ps,
        scrollPaddingEnd: pe,
      });
      if (goal === null) return;
      const value = Math.max(0, goal + margin);
      writeScroll(element, h, value, behavior);
      if (behavior === 'smooth') return;
      // Sizes past the rendered window may still be estimates: the post-commit pass re-aims
      // (with the side `auto` picked now) once the items around the target are measured.
      const side: VirtualAlign = align === 'auto' ? (value < current ? 'start' : 'end') : align;
      pendingScroll.current = { index: clamp(index, 0, m.count - 1), align: side, attempts: 0 };
      const actual = readScroll(element, h);
      setView((prev) => (prev.scroll === actual ? prev : { ...prev, scroll: actual }));
    },
    [scrollRef, latest],
  );

  const getItem = useCallback(
    (index: number): VirtualItem | undefined => {
      if (index < 0 || index >= measurements.count) return undefined;
      const start = measurements.starts[index];
      const size = measurements.sizes[index];
      return { index, key: getItemKey(index), start, size, end: start + size };
    },
    [measurements, getItemKey],
  );

  const range = getVisibleRange(measurements, view.scroll - scrollMargin, view.viewport);
  const rendered = withOverscan(range, measurements.count, overscan);
  const items: VirtualItem[] = [];
  for (let i = rendered.start; i < rendered.end; i++) items.push(getItem(i)!);

  return { items, range, totalSize: measurements.total, getItem, scrollToIndex, scrollToOffset, measureElement };
}
