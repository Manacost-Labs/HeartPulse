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
/** At most this many neighbours of one batch wait their turn; the rest start with the last. */
const STAGGER_STEPS = 3;

function fadeIn(elements: Element[], keyframes: Keyframe[] = FADE, token = '--motion-fast'): Animation[] {
  const duration = motionMs(token);
  if (!duration) return [];
  const easing = motionEasing('--motion-ease');
  return elements.map(element => element.animate(keyframes, { duration, easing }));
}

/**
 * Sections that replace their skeletons: a short fade and rise by
 * `--motion-rise`, neighbours of one batch a `--motion-stagger` step apart
 * (header, then figures, then content, in document order). Transform and
 * opacity only, so nothing is laid out again and no layout shift is counted.
 */
/** A section that already plays a scripted settle of its own (the home feed) keeps it. */
const scripted = (animations: Animation[]) => animations.some(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));

/** A section that already plays a scripted settle of its own (the home feed), around or inside it, keeps it. */
function settlingOnItsOwn(element: Element, box: HTMLElement): boolean {
  if (scripted(element.getAnimations({ subtree: true }))) return true;
  for (let node = element.parentElement; node && node !== box; node = node.parentElement) {
    if (scripted(node.getAnimations())) return true;
  }
  return false;
}

function arrive(candidates: Element[], box: HTMLElement): Animation[] {
  const elements = candidates.filter(element => !settlingOnItsOwn(element, box));
  const duration = motionMs('--motion-base');
  if (!duration) return [];
  const easing = motionEasing('--motion-ease');
  const step = motionMs('--motion-stagger');
  const rise = getComputedStyle(document.documentElement).getPropertyValue('--motion-rise').trim() || '0px';
  const keyframes: Keyframe[] = [{ opacity: 0, transform: `translateY(${rise})` }, { opacity: 1, transform: 'none' }];
  return elements.map((element, index) => element.animate(keyframes,
    { duration, easing, delay: Math.min(index, STAGGER_STEPS) * step, fill: 'backwards' }));
}

/** On the first document the access check's placeholder is a loading state too: the gate or page replaces it. */
const FIRST_LOAD_PLACEHOLDER = `${SKELETON}, .arena-paywall-pending`;

const isPlaceholder = (node: Node, selector: string) => node instanceof Element
  && (node.matches(selector) || node.querySelector(selector) !== null);

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
function arrivedContent(records: MutationRecord[], box: HTMLElement, placeholder: string): Element[] {
  const replaced = new Set<Node>();
  for (const record of records) {
    if ([...record.removedNodes].some(node => isPlaceholder(node, placeholder))) replaced.add(record.target);
  }
  const added: Element[] = [];
  for (const record of records) {
    if (!replaced.has(record.target)) continue;
    for (const node of record.addedNodes) {
      if (node instanceof Element && node.isConnected && !isPlaceholder(node, placeholder)) added.push(node);
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
 * navigation's `keyframes` over `--motion-base`, otherwise as the short
 * arrival of each section as it replaces a `placeholder` (not the navigation's
 * larger preset: a late section only settles in), until none is left, the
 * reader acts or `ARRIVAL_WINDOW_MS` passes. Returns the cancellation.
 */
function enter(box: HTMLElement, keyframes: Keyframe[], placeholder = SKELETON, announce = true): () => void {
  const animations: Animation[] = [];
  if (!box.querySelector(placeholder)) {
    const content = [...box.children].filter(child => !(child as HTMLElement).hidden);
    animations.push(...fadeIn(content, keyframes, '--motion-base'));
    clipWhileMoving(box, animations);
    return () => animations.forEach(animation => animation.cancel());
  }
  // A navigation's arrivals tell nested settles to stand aside; the first
  // document's do not: the home feed keeps its own settle there.
  if (announce) setRouteEntranceActive(true);
  const observer = new MutationObserver(records => {
    animations.push(...arrive(arrivedContent(records, box, placeholder), box));
    if (!box.querySelector(placeholder)) stop();
  });
  const timer = setTimeout(() => stop(), ARRIVAL_WINDOW_MS);
  // From the reader's first input on, new content answers them, not the navigation.
  const options = { capture: true, once: true } as const;
  function stop() {
    if (announce) setRouteEntranceActive(false);
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
  const firstArrivals = useRef<(() => void) | null>(null);
  // The first document: its server HTML (and the largest paint) stays still;
  // only sections that later replace a skeleton arrive with the same motion.
  useLayoutEffect(() => {
    const box = root.current?.querySelector<HTMLElement>('[data-route-content]');
    if (!box?.animate || !box.querySelector(FIRST_LOAD_PLACEHOLDER) || prefersReducedMotion()) return;
    firstArrivals.current = enter(box, FADE, FIRST_LOAD_PLACEHOLDER, false);
    return () => firstArrivals.current?.();
  }, []);
  useLayoutEffect(() => {
    if (previousKey.current === routeKey) return;
    previousKey.current = routeKey;
    // A navigation ends the first document's arrivals: the new page has its own entrance.
    firstArrivals.current?.();
    firstArrivals.current = null;
    const entrance = takeExpectedRouteEntrance(routeKey);
    const box = root.current?.querySelector<HTMLElement>('[data-route-content]');
    if (!entrance || !box?.animate || prefersReducedMotion()) return;
    return enter(box, entrance);
  }, [routeKey]);
  return <div ref={root} style={{ display: 'contents' }}>{children}</div>;
}
