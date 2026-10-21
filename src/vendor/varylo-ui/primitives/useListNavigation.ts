'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { getDirection } from './utils';

export interface ListNavigationOptions {
  count: number;
  isDisabled?: (index: number) => boolean;
  /** Label used for type-ahead. */
  getLabel?: (index: number) => string;
  onSelect?: (index: number) => void;
  loop?: boolean;
  orientation?: 'vertical' | 'horizontal';
  initialIndex?: number;
}

const never = () => false;

/**
 * The first enabled index after `from` in direction `delta`. `from` may be -1 or
 * `count` to search from either end. Returns `from` when nothing further is
 * enabled (end of a non-looping list), or -1 when `from` itself is out of range.
 */
export function stepIndex(
  count: number,
  from: number,
  delta: 1 | -1,
  isDisabled: (index: number) => boolean = never,
  loop = true,
): number {
  for (let i = 1; i <= count; i++) {
    let next = from + delta * i;
    if (loop) next = ((next % count) + count) % count;
    else if (next < 0 || next >= count) break;
    if (!isDisabled(next)) return next;
  }
  return from >= 0 && from < count ? from : -1;
}

/**
 * Type-ahead match for `query` (lower-case). A single character searches after
 * the active item so repeated presses cycle; repeating one character ("aaa")
 * also cycles; a longer query refines the current match. Returns -1 if none.
 */
export function findTypeaheadMatch(
  count: number,
  query: string,
  activeIndex: number,
  getLabel: (index: number) => string,
  isDisabled: (index: number) => boolean = never,
): number {
  if (count === 0 || !query) return -1;
  const chars = Array.from(query);
  const search = chars.every((ch) => ch === chars[0]) ? chars[0] : query;
  const start = search.length > 1 ? Math.max(activeIndex, 0) : activeIndex + 1;
  for (let i = 0; i < count; i++) {
    const index = (((start + i) % count) + count) % count;
    if (!isDisabled(index) && getLabel(index).trim().toLowerCase().startsWith(search)) return index;
  }
  return -1;
}

/**
 * Keyboard model for menus/listboxes: arrows, Home/End, Enter/Space, type-ahead.
 * Keep DOM focus on the container (or input) and mark the active row with
 * `data-highlighted` + `aria-activedescendant`.
 */
export function useListNavigation({
  count,
  isDisabled = never,
  getLabel,
  onSelect,
  loop = true,
  orientation = 'vertical',
  initialIndex = -1,
}: ListNavigationOptions) {
  const [rawIndex, setActiveIndex] = useState(initialIndex);
  const typeahead = useRef({ text: '', timer: 0 });
  // The list can shrink under a stale index (filtering); never expose or select a row that is gone.
  const activeIndex = rawIndex >= 0 && rawIndex < count ? rawIndex : -1;

  useEffect(() => () => window.clearTimeout(typeahead.current.timer), []);

  const step = (from: number, delta: 1 | -1) => stepIndex(count, from, delta, isDisabled, loop);
  const first = () => stepIndex(count, -1, 1, isDisabled, loop);
  const last = () => stepIndex(count, count, -1, isDisabled, loop);
  const inRange = (i: number) => i >= 0 && i < count;

  const onKeyDown = (event: KeyboardEvent) => {
    if (count === 0) return;
    const rtl = orientation === 'horizontal' && getDirection(event.currentTarget as Element) === 'rtl';
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = orientation === 'vertical' ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
    const state = typeahead.current;
    // While the user is typing a query, Space is part of it ("New York"), not a selection.
    const typing = !!getLabel && state.text !== '';

    const selectKey = event.key === 'Enter' || (event.key === ' ' && !typing);
    if (selectKey) {
      if (activeIndex >= 0 && !isDisabled(activeIndex)) {
        event.preventDefault();
        onSelect?.(activeIndex);
      }
      return;
    }

    switch (event.key) {
      case nextKey:
        event.preventDefault();
        setActiveIndex((i) => (inRange(i) ? step(i, 1) : first()));
        return;
      case prevKey:
        event.preventDefault();
        setActiveIndex((i) => (inRange(i) ? step(i, -1) : last()));
        return;
      case 'Home':
        event.preventDefault();
        setActiveIndex(first());
        return;
      case 'End':
        event.preventDefault();
        setActiveIndex(last());
        return;
    }

    if (getLabel && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      window.clearTimeout(state.timer);
      state.text += event.key.toLowerCase();
      state.timer = window.setTimeout(() => (state.text = ''), 500);
      if (event.key === ' ') event.preventDefault();
      const match = findTypeaheadMatch(count, state.text, activeIndex, getLabel, isDisabled);
      if (match !== -1) setActiveIndex(match);
    }
  };

  return { activeIndex, setActiveIndex, onKeyDown };
}
