import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { motionEasing, motionMs, prefersReducedMotion } from './motionTokens';
import { setRouteEntranceActive, takeExpectedRouteEntrance } from './routeEntrance';

/** Skeleton primitives of LoadingSurface.tsx: content that is not the page yet. */
const SKELETON = '.loading-block, [data-loading-surface]';
/** A page still showing skeletons after this long has no entrance left to play. */
const ARRIVAL_WINDOW_MS = 10_000;
/** More new siblings than this (a grid filling in) fade as their parent, not one by one. */
const SIBLING_GROUP = 8;

const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

function fadeIn(elements: Element[], keyframes: Keyframe[] = FADE, token = '--motion-fast'): Animation[] {
  const duration = motionMs(token);
  if (!duration) return [];
  const easing = motionEasing('--motion-ease');
  return elements.map(element => element.animate(keyframes, { duration, easing }));
}

const isSkeleton = (node: Node) => node instanceof Element && (node.matches(SKELETON) || node.querySelector(SKELETON) !== null);

/** A sideways or zooming entrance must not widen the page into a horizontal scrollbar while it plays. */
function clipWhileMoving(box: HTMLElement, animations: Animation[]): void {
  if (!animations.length) return;
  const overflowX = box.style.overflowX;
  box.style.overflowX = 'clip';
  Promise.allSettled(animations.map(animation => animation.finished)).then(() => { box.style.overflowX = overflowX; });
}

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
 * Plays the page's single entrance: at once when it commits ready, with the
 * navigation's `keyframes` over `--motion-base`, otherwise as a plain fade on
 * each section as it replaces its skeleton (a section arriving late must not
 * travel), until none is left, the reader acts or `ARRIVAL_WINDOW_MS` passes.
 * Returns the cancellation.
 */
function enter(box: HTMLElement, keyframes: Keyframe[]): () => void {
  const animations: Animation[] = [];
  if (!box.querySelector(SKELETON)) {
    const content = [...box.children].filter(child => !(child as HTMLElement).hidden);
    animations.push(...fadeIn(content, keyframes, '--motion-base'));
    clipWhileMoving(box, animations);
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
 * Gives a navigated page one short entrance inside its marked
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
    const entrance = takeExpectedRouteEntrance(routeKey);
    const box = root.current?.querySelector<HTMLElement>('[data-route-content]');
    if (!entrance || !box?.animate || prefersReducedMotion()) return;
    return enter(box, entrance);
  }, [routeKey]);
  return <div ref={root} style={{ display: 'contents' }}>{children}</div>;
}
