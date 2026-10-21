'use client';

import { useEffect, useRef, useState, type ComponentPropsWithRef, type Key, type ReactNode } from 'react';
// HearthPulse: the utils module, not the primitives barrel (keeps the barrel's other modules out of the page chunks).
import { cx, getDirection, mergeRefs, useLatest } from '../primitives/utils';
import { withRef, useLayoutEffect } from '../primitives/react-compat';
import {
  coverRadius,
  pageTransitionSpec,
  pageTransitionTempo,
  reducedPageTransition,
  type PageTransitionDirection,
  type PageTransitionPreset,
  type PageTransitionSpec,
  type PageTransitionTier,
} from './page-transitions';
import { isMotionReduced } from './preference';
import { parseTime } from './profile';
import { resolveRenderTier, warmRenderTier, type PageTransitionTierSetting } from './render-tier';
import './PageTransition.css';

export interface PageTransitionProps extends ComponentPropsWithRef<'div'> {
  /** Identity of the page shown: a route path, a step id. When it changes, the page before leaves and the new one enters. */
  pageKey: Key;
  /** How the pages change. */
  preset?: PageTransitionPreset;
  /** forward — deeper in (a link, the next step); back — the way back. Sideways presets mirror, stacked ones pop. */
  direction?: PageTransitionDirection;
  /** Length of a change, ms. Default: the preset's own, at the theme's tempo (`--ui-duration`). */
  duration?: number;
  /** Where `circle` grows from, in viewport px — usually the click: `{ x: event.clientX, y: event.clientY }`. Default: the middle of what is visible. */
  origin?: { x: number; y: number };
  /**
   * gpu — the full preset; cpu — its one-layer variant for machines that composite on the processor
   * (virtual machines, remote desktops, servers, software WebGL); auto — cpu on such machines and on
   * devices with two cores or 2 GB of memory or less, gpu elsewhere.
   */
  tier?: PageTransitionTierSetting;
  /** Called when a change has finished and the old page is gone. */
  onTransitionComplete?: () => void;
}

interface Leaving {
  key: Key;
  node: ReactNode;
}

/** The properties a preset animates: what a change taken over mid-way starts from. */
const ANIMATED = ['opacity', 'transform', 'clipPath', 'filter'] as const;

/** Set on the container while a 3D preset plays; PageTransition.css turns it into the perspective. */
const DEPTH = '--ui-page-transition-depth';

const targetOf = (animation: Animation) => (animation.effect as KeyframeEffect | null)?.target ?? null;

/** The theme's tempo at `element`, as a factor of the reference 200 ms. */
const tempoAt = (element: Element) => pageTransitionTempo(parseTime(getComputedStyle(element).getPropertyValue('--ui-duration')));

/** Whether any of `box` is on screen: a change nobody can see is not worth a frame. */
const onScreen = (box: DOMRect) => box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth;

/** The spec of a change at `page`: circle grows from the origin over the part of the page that is on screen. */
function specFor(page: HTMLElement, box: DOMRect, preset: PageTransitionPreset, direction: PageTransitionDirection, tier: PageTransitionTier, origin?: { x: number; y: number }): PageTransitionSpec {
  const rtl = getDirection(page) === 'rtl';
  if (preset !== 'circle' || tier === 'cpu') return pageTransitionSpec(preset, { direction, rtl, tier });
  const left = Math.max(box.left, 0);
  const top = Math.max(box.top, 0);
  const right = Math.min(box.right, window.innerWidth);
  const bottom = Math.min(box.bottom, window.innerHeight);
  const point = origin ?? { x: (left + right) / 2, y: (top + bottom) / 2 };
  const local = { x: point.x - left, y: point.y - top };
  return pageTransitionSpec(preset, {
    direction,
    rtl,
    origin: { x: point.x - box.left, y: point.y - box.top },
    radius: coverRadius(local, Math.max(right - left, 0), Math.max(bottom - top, 0)),
  });
}

/** `keyframes` starting from where `element` is drawn now (a change that takes over one still running). */
function fromCurrent(keyframes: Keyframe[], element: Element): Keyframe[] {
  if (!keyframes.length) return keyframes;
  const style = getComputedStyle(element);
  const [first, ...rest] = keyframes;
  const start: Keyframe = { ...first };
  for (const property of ANIMATED) {
    if (property in start) start[property] = style[property];
  }
  return [start, ...rest];
}

/**
 * Changes between pages — routes, the steps of a flow, the panels of a tab bar — with one of forty
 * presets. The page before stays mounted (inert, hidden from assistive technology) while it leaves, the
 * new one enters over or under it, then the old one unmounts. A change during a change takes over from
 * where the pages are drawn, so fast clicks never jump. Focus inside the old page moves to the new one.
 * Web Animations on transform and opacity (clip-path and filter for the presets that say so), at the
 * theme's tempo; no layout runs while the pages move, and a page that stays put is not animated at all.
 * Nothing plays in a hidden tab or off screen. On machines without GPU compositing each preset plays its
 * one-layer CPU variant. Reduced motion: a short dissolve.
 */
export const PageTransition = withRef(function PageTransition({
  pageKey,
  preset = 'fade',
  direction = 'forward',
  duration,
  origin,
  tier = 'auto',
  onTransitionComplete,
  className,
  children,
  ref,
  ...rest
}: PageTransitionProps) {
  const [shown, setShown] = useState<Key>(pageKey);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  // The current page as last rendered: what leaves when the key changes.
  const last = useRef<ReactNode>(children);
  if (shown !== pageKey) {
    setShown(pageKey);
    setLeaving({ key: shown, node: last.current });
  }
  const rootRef = useRef<HTMLDivElement>(null);
  const running = useRef<Animation[]>([]);
  const settings = useLatest({ preset, direction, duration, origin, tier });
  const done = useLatest(onTransitionComplete);

  useLayoutEffect(() => {
    last.current = children;
  });

  // The machine check runs while the browser is idle, not on the first click.
  useEffect(() => {
    if (tier === 'auto') warmRenderTier();
  }, [tier]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!leaving) {
      // The old page is gone: the layers stop clipping and stacking.
      running.current.forEach((animation) => animation.cancel());
      running.current = [];
      root.removeAttribute('data-transitioning');
      root.removeAttribute('data-top');
      root.removeAttribute('data-tier');
      root.style.removeProperty(DEPTH);
      return;
    }
    const pages = Array.from(root.children) as HTMLElement[];
    const outgoing = pages.find((page) => page.hasAttribute('data-leaving'));
    const incoming = pages.find((page) => !page.hasAttribute('data-leaving'));
    if (!outgoing || !incoming) return;

    // A page coming back mid-exit (A → B → A) is live again.
    incoming.inert = false;
    const focused = outgoing.contains(document.activeElement);
    outgoing.inert = true;
    if (focused) {
      // Focusable just for this: once focus moves on, a click inside the page no longer lands on the layer.
      if (!incoming.hasAttribute('tabindex')) {
        incoming.tabIndex = -1;
        incoming.addEventListener('blur', () => incoming.removeAttribute('tabindex'), { once: true });
      }
      incoming.focus({ preventScroll: true });
    }

    const previous = running.current;
    running.current = [];
    const finish = () => {
      setLeaving((current) => (current === leaving ? null : current));
      done.current?.();
    };
    // The container, not the page: a page caught mid-change may be translated off screen.
    const box = root.getBoundingClientRect();
    // No Web Animations, a tab in the background, a container scrolled away: the new page simply appears.
    if (typeof incoming.animate !== 'function' || document.visibilityState === 'hidden' || !onScreen(box)) {
      previous.forEach((animation) => animation.cancel());
      finish();
      return;
    }

    const { preset: kind, direction: way, duration: ms, origin: point, tier: setting } = settings.current;
    const reduced = isMotionReduced(root);
    const resolved = resolveRenderTier(setting);
    const spec = reduced ? reducedPageTransition() : specFor(incoming, box, kind, way, resolved, point);
    const length = reduced ? spec.duration : (ms ?? Math.round(spec.duration * Math.min(tempoAt(root), resolved === 'cpu' ? 1 : Infinity)));
    // Pages still moving from the change before start from where they are drawn, not from rest.
    const moving = new Set(previous.map(targetOf));
    const exitFrames = moving.has(outgoing) ? fromCurrent(spec.exit.keyframes, outgoing) : spec.exit.keyframes;
    const enterFrames = moving.has(incoming) ? fromCurrent(spec.enter.keyframes, incoming) : spec.enter.keyframes;
    previous.forEach((animation) => animation.cancel());

    root.setAttribute('data-transitioning', '');
    root.setAttribute('data-top', spec.top);
    if (resolved === 'cpu') root.setAttribute('data-tier', 'cpu');
    else root.removeAttribute('data-tier');
    if (spec.perspective) root.style.setProperty(DEPTH, `${spec.perspective}px`);
    else root.style.removeProperty(DEPTH);
    const timing = { duration: length, fill: 'both' as const };
    // A page that stays put gets no animation: no layer, no compositing work.
    const exit = exitFrames.length ? outgoing.animate(exitFrames, { ...timing, easing: spec.exit.easing }) : null;
    const enter = enterFrames.length ? incoming.animate(enterFrames, { ...timing, easing: spec.enter.easing }) : null;
    const animations = [exit, enter].filter((animation): animation is Animation => !!animation);
    running.current = animations;
    if (!animations.length) {
      finish();
      return;
    }
    Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (running.current !== animations) return;
        // The old page keeps its last frame until it unmounts, so nothing of it flashes back.
        running.current = exit ? [exit] : [];
        enter?.cancel();
        finish();
      },
      () => {},
    );
  }, [leaving, settings, done]);

  useEffect(
    () => () => {
      running.current.forEach((animation) => animation.cancel());
      running.current = [];
    },
    [],
  );

  return (
    <div {...rest} ref={mergeRefs(rootRef, ref)} className={cx('ui-page-transition', className)}>
      {leaving && (
        <div key={leaving.key} className="ui-page-transition__page" data-leaving="" aria-hidden="true">
          {leaving.node}
        </div>
      )}
      <div key={shown} className="ui-page-transition__page">
        {children}
      </div>
    </div>
  );
});
