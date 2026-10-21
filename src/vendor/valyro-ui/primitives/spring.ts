/*
 * Damped springs for the kit's motion. The closed-form curve becomes a CSS `linear()` easing, so a
 * transition, a keyframe animation or a Web Animation moves like a spring with no frame loop and no
 * React render per frame; `stepSpring` advances a value that chases a moving target (a pointer) inside
 * a rAF loop. Pure: runs in tests and on the server.
 */

export interface SpringOptions {
  /** Stiffness k: higher is faster (default 170). */
  stiffness?: number;
  /** Damping c: lower bounces more (default 26). */
  damping?: number;
  /** Mass m (default 1). */
  mass?: number;
}

const DEFAULTS = { stiffness: 170, damping: 26, mass: 1 };

/** Options with the defaults filled in; a field passed as `undefined` keeps its default. */
function resolve(options: SpringOptions) {
  return {
    stiffness: options.stiffness ?? DEFAULTS.stiffness,
    damping: options.damping ?? DEFAULTS.damping,
    mass: options.mass ?? DEFAULTS.mass,
  };
}

/** Position of a spring released at rest from 0 towards 1, `t` seconds later. */
export function springAt(t: number, options: SpringOptions = {}): number {
  const { stiffness, damping, mass } = resolve(options);
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    // Underdamped: overshoots 1 and rings down.
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * w0 * t);
    return 1 - envelope * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
  // Overdamped: creeps up without overshoot.
  const root = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + root;
  const r2 = -zeta * w0 - root;
  const c1 = r2 / (r1 - r2);
  const c2 = -1 - c1;
  return 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
}

/** Seconds until the spring stays within `precision` of its target. */
export function springDuration(options: SpringOptions = {}, precision = 0.001): number {
  const step = 1 / 240;
  let settled = 0;
  for (let t = step; t < 10; t += step) {
    if (Math.abs(springAt(t, options) - 1) > precision) settled = t + step;
  }
  return Math.round(settled * 1000) / 1000;
}

/** A CSS `linear()` easing that traces the spring over its springDuration, with `points` samples. */
export function springLinear(options: SpringOptions = {}, points = 40): string {
  const duration = springDuration(options);
  const values: string[] = [];
  for (let i = 0; i <= points; i++) {
    const value = i === points ? 1 : springAt((duration * i) / points, options);
    values.push(String(Math.round(value * 10000) / 10000));
  }
  return `linear(${values.join(', ')})`;
}

/** Easing and duration (ms) for `element.animate()` — a Web Animation that moves like the spring. */
export function springEasing(options: SpringOptions = {}): { easing: string; duration: number } {
  return { easing: springLinear(options), duration: Math.round(springDuration(options) * 1000) };
}

/**
 * The kit's three springs. Their curves are the `--ui-spring-*` easings in motion.css (a test keeps
 * them in sync); `factor` is each one's settle time over 340 ms, the reference `--ui-duration-slow`, so
 * CSS sets `calc(var(--ui-duration-slow) * factor)` and every theme's tempo (and reduced motion's 1 ms)
 * carries over.
 */
export const SPRINGS = {
  /** Critically damped: settles without overshoot. Dialogs, drawers, tooltips. */
  smooth: { stiffness: 200, damping: 28.3 },
  /** A hint of overshoot. Tabs, menus, popovers. */
  snappy: { stiffness: 300, damping: 26 },
  /** A visible bounce. Avatars, toggles, playful controls. */
  bouncy: { stiffness: 300, damping: 15 },
} satisfies Record<string, SpringOptions>;

export type SpringName = keyof typeof SPRINGS;

/** Settle time of a named spring over the 340 ms reference duration, rounded for CSS. */
export function springFactor(name: SpringName): number {
  return Math.round((springDuration(SPRINGS[name]) / 0.34) * 100) / 100;
}

export interface SpringValue {
  value: number;
  velocity: number;
}

/**
 * Advances `spring` towards `target` by `dt` seconds, in place, in sub-steps of at most 1/120 s so it
 * stays stable when frames drop. Returns true once at rest (snapped exactly onto the target).
 */
export function stepSpring(spring: SpringValue, target: number, dt: number, options: SpringOptions = {}, precision = 0.01): boolean {
  const { stiffness, damping, mass } = resolve(options);
  const steps = Math.max(1, Math.ceil(dt * 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const force = -stiffness * (spring.value - target) - damping * spring.velocity;
    spring.velocity += (force / mass) * h;
    spring.value += spring.velocity * h;
  }
  if (Math.abs(spring.value - target) < precision && Math.abs(spring.velocity) < precision * 10) {
    spring.value = target;
    spring.velocity = 0;
    return true;
  }
  return false;
}

/* ----------------------------------------------------------------------------------------------
 * Browser: Web Animations at the theme's tempo
 * -------------------------------------------------------------------------------------------- */

/** The reference `--ui-duration-slow` the spring factors are measured against, ms. */
const REFERENCE_SLOW_MS = 340;
const easingCache = new Map<SpringName, string>();

/** `--ui-duration-slow` on `element` in ms (`340ms`, `0.34s`); the reference when unset. */
export function themeSlowMs(element: Element): number {
  const raw = getComputedStyle(element).getPropertyValue('--ui-duration-slow').trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return REFERENCE_SLOW_MS;
  return /ms$/.test(raw) ? value : /s$/.test(raw) ? value * 1000 : value;
}

/**
 * Plays `keyframes` on `element` with a named spring — the Web Animations twin of the CSS presets:
 * the spring's settle time scaled by the theme's `--ui-duration-slow`, so a fast theme springs faster
 * and the themes' reduced-motion block (1 ms) makes it instant. Browser only; call it from events or
 * effects. Returns undefined where Web Animations are missing.
 */
export function animateSpring(
  element: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  spring: SpringName = 'snappy',
  options: KeyframeAnimationOptions = {},
): Animation | undefined {
  if (typeof element.animate !== 'function') return undefined;
  let easing = easingCache.get(spring);
  if (!easing) {
    const supported = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)');
    easing = supported ? springLinear(SPRINGS[spring]) : 'cubic-bezier(0.22, 1, 0.36, 1)';
    easingCache.set(spring, easing);
  }
  const duration = (springDuration(SPRINGS[spring]) * 1000 * themeSlowMs(element)) / REFERENCE_SLOW_MS;
  return element.animate(keyframes, { duration, easing, ...options });
}
