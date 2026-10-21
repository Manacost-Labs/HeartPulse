import { useCallback, useLayoutEffect, useRef, type Key, type MutableRefObject, type RefCallback } from 'react';
import { motionEasing, motionMs, prefersReducedMotion } from '../../shared/ui/motionTokens';
import { transitionPresetsNow } from './lazyTransitionPresets';
import { switchDirection, type TransitionDirection } from './transitionOrder';

/** More moved items than this jump to their places instead of gliding: the reads and layers would cost more than they show. */
const FLIP_LIMIT = 60;
/** Rows after this enter together with it: a long cascade delays the last cards past the answer to the click. */
const STAGGER_ROWS = 2;

interface Place { x: number; y: number }

/** Before the preset engine has loaded at idle (`lazyTransitionPresets`), items fade. */
const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/** The list's mode (Стандарт / Вольный) and the order of its switch. */
export interface ListTransitionMode { key: Key; order: readonly Key[] }

const placeOf = (item: HTMLElement, list: HTMLElement): Place | null =>
  item.offsetParent === list.offsetParent ? { x: item.offsetLeft - list.offsetLeft, y: item.offsetTop - list.offsetTop } : null;

function measure(list: HTMLElement): WeakMap<Element, Place> {
  const places = new WeakMap<Element, Place>();
  for (const child of list.children as HTMLCollectionOf<HTMLElement>) {
    const place = placeOf(child, list);
    if (place) places.set(child, place);
  }
  return places;
}

/**
 * Animates a keyed list (a card grid) when `items` changes: new items enter with
 * the ValyroUI fade-through, row by row (`--motion-stagger`, at most
 * `STAGGER_ROWS` steps); items that stayed glide from their old place (FLIP)
 * while at most `FLIP_LIMIT` moved. Only opacity and transform animate, only for
 * items on screen, never on the first render (SSR content does not move) and
 * never when the list element itself is new (a ViewSwitch already plays that
 * change). Items keep their DOM nodes across renders (React keys), which is how
 * an item that stayed is told from a new one. When `mode` changes (another
 * mode's list arrived), the new items slide in with the ValyroUI shared-x
 * towards the chosen mode instead. Reduced motion: new items fade, nothing
 * travels.
 *
 * Returns the ref for the list element; `forward` also receives the element.
 */
export function useListTransition<T extends HTMLElement>(items: unknown, forward?: MutableRefObject<T | null>, mode?: ListTransitionMode): RefCallback<T> {
  const list = useRef<T | null>(null);
  const lastMode = useRef(mode?.key);
  const measured = useRef<{ list: T; width: number; places: WeakMap<Element, Place> } | null>(null);
  const running = useRef<Animation[]>([]);
  const ref = useCallback((node: T | null) => {
    list.current = node;
    if (forward) forward.current = node;
    if (!node) return undefined;
    // A list that has just mounted starts from its own places: its first items do not enter.
    measured.current = { list: node, width: node.clientWidth, places: measure(node) };
    return () => {
      // Another element (the next view) may hold the ref by now.
      if (list.current === node) list.current = null;
      if (forward?.current === node) forward.current = null;
    };
  }, [forward]);
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    running.current.forEach(animation => animation.cancel());
    running.current = [];
    // A resized list (another column count) does not glide from its stale grid.
    const width = node.clientWidth;
    const before = measured.current?.list === node && measured.current.width === width ? measured.current.places : null;
    const after = measure(node);
    measured.current = { list: node, width, places: after };
    const modeChange: TransitionDirection | null = mode && lastMode.current !== undefined && lastMode.current !== mode.key
      ? switchDirection(mode.order, lastMode.current, mode.key) : null;
    lastMode.current = mode?.key;
    if (before && typeof node.animate === 'function') running.current = animateChange(node, before, after, modeChange);
  }, [items, mode?.key, mode?.order]);
  useLayoutEffect(() => () => running.current.forEach(animation => animation.cancel()), []);
  return ref;
}

function animateChange(list: HTMLElement, before: WeakMap<Element, Place>, after: WeakMap<Element, Place>, modeChange: TransitionDirection | null): Animation[] {
  const duration = motionMs('--motion-base');
  if (!duration) return [];
  const reduced = prefersReducedMotion();
  const easing = motionEasing('--motion-ease');
  const step = reduced ? 0 : motionMs('--motion-stagger');
  const children = [...list.children] as HTMLElement[];
  const top = list.getBoundingClientRect().top;
  const visible = (place: Place, item: HTMLElement) => top + place.y < innerHeight && top + place.y + item.offsetHeight > 0;
  const entering = children.filter(child => !before.has(child) && after.has(child) && visible(after.get(child), child));
  const moved = reduced ? [] : children.filter(child => {
    const from = before.get(child);
    const to = after.get(child);
    return from && to && (from.x !== to.x || from.y !== to.y) && (visible(from, child) || visible(to, child));
  });
  const animations: Animation[] = [];
  const presets = transitionPresetsNow();
  const frames = presets ? presets.entranceKeyframes(modeChange ? 'shared-x' : 'fade-through', modeChange ?? 'forward', reduced) : FADE;
  const rows = [...new Set(entering.map(child => after.get(child).y))].sort((a, b) => a - b);
  for (const child of entering) {
    const row = Math.min(rows.indexOf(after.get(child).y), STAGGER_ROWS);
    animations.push(child.animate(frames, { duration, easing, delay: row * step, fill: 'backwards' }));
  }
  if (moved.length <= FLIP_LIMIT) {
    for (const child of moved) {
      const from = before.get(child);
      const to = after.get(child);
      animations.push(child.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` }, { transform: 'none' }], { duration, easing }));
    }
  }
  return animations;
}
