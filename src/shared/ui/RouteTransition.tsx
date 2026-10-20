import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { motionEasing, motionMs, prefersReducedMotion } from './motionTokens';
import { setRouteEntranceActive, takeExpectedRouteEntrance } from './routeEntrance';

/** Skeleton primitives of LoadingSurface.tsx: content that is not the page yet. */
const SKELETON = '.loading-block, [data-loading-surface]';
/** A page still showing skeletons after this long has no entrance left to play. */
const ARRIVAL_WINDOW_MS = 10_000;
/** More new siblings than this (a grid filling in) fade as their parent, not one by one. */
const SIBLING_GROUP = 8;

function fadeIn(elements: Element[]): Animation[] {
  const duration = motionMs('--motion-fast');
  if (!duration) return [];
  const easing = motionEasing('--motion-ease');
  return elements.map(element => element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing }));
}

const isSkeleton = (node: Node) => node instanceof Element && (node.matches(SKELETON) || node.querySelector(SKELETON) !== null);

/**
 * The outermost elements that took a skeleton's place (inserted into a parent
 * that lost one in the same batch); a list filling in at once fades as its parent.
 */
function arrivedContent(records: MutationRecord[], box: HTMLElement): Element[] {
  const replaced = new Set<Node>();
  for (const record of records) {
    if ([...record.removedNodes].some(isSkeleton)) replaced.add(record.target);
  }
  const added: Element[] = [];
  for (const record of records) {
    if (!replaced.has(record.target)) continue;
    for (const node of record.addedNodes) {
      if (node instanceof Element && node.isConnected && !isSkeleton(node)) added.push(node);
    }
  }
  const byParent = new Map<Element, Element[]>();
  for (const element of added) {
    const parent = element.parentElement ?? box;
    const siblings = byParent.get(parent);
    if (siblings) siblings.push(element);
    else byParent.set(parent, [element]);
  }
  return [...byParent].flatMap(([parent, children]) =>
    children.length > SIBLING_GROUP && parent !== box && box.contains(parent) ? [parent] : children);
}

/**
 * Plays the page's single entrance: at once when it commits ready, otherwise
 * on each section as it replaces its skeleton, until none is left, the
 * reader acts or `ARRIVAL_WINDOW_MS` passes. Returns the cancellation.
 */
function enter(box: HTMLElement): () => void {
  const animations: Animation[] = [];
  if (!box.querySelector(SKELETON)) {
    animations.push(...fadeIn([...box.children].filter(child => !(child as HTMLElement).hidden)));
    return () => animations.forEach(animation => animation.cancel());
  }
  setRouteEntranceActive(true);
  const observer = new MutationObserver(records => {
    animations.push(...fadeIn(arrivedContent(records, box)));
    if (!box.querySelector(SKELETON)) stop();
  });
  const timer = setTimeout(() => stop(), ARRIVAL_WINDOW_MS);
  // From the reader's first input on, new content answers them, not the navigation.
  const options = { capture: true, once: true } as const;
  function stop() {
    setRouteEntranceActive(false);
    observer.disconnect();
    clearTimeout(timer);
    document.removeEventListener('pointerdown', stop, options);
    document.removeEventListener('keydown', stop, options);
  }
  observer.observe(box, { childList: true, subtree: true });
  document.addEventListener('pointerdown', stop, options);
  document.addEventListener('keydown', stop, options);
  return () => {
    stop();
    animations.forEach(animation => animation.cancel());
  };
}

/**
 * Gives a navigated page one short opacity entrance inside its marked
 * `data-route-content` box, never on a skeleton. The frame of the box and the
 * first document paint stay still. It runs after the commit, so no navigation
 * waits for it, and children keep their identity.
 */
export function RouteTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const previousKey = useRef(routeKey);
  useLayoutEffect(() => {
    if (previousKey.current === routeKey) return;
    previousKey.current = routeKey;
    const navigated = takeExpectedRouteEntrance(routeKey);
    const box = root.current?.querySelector<HTMLElement>('[data-route-content]');
    if (!navigated || !box?.animate || prefersReducedMotion()) return;
    return enter(box);
  }, [routeKey]);
  return <div ref={root} style={{ display: 'contents' }}>{children}</div>;
}
