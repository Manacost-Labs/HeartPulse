/*
 * A theme's motion profile: how far entrances travel, how long they take, how bouncy the springs are,
 * how much things tilt and pull. Every value comes from an optional `--ui-motion-*` token with a default
 * derived from the theme's tempo (`--ui-duration`, `--ui-duration-slow`), so a fast theme moves fast and
 * the reduced-motion tokens (1 ms) make every entrance instant. See styles/motion.css for the tokens.
 */
// HearthPulse: the spring module, not the primitives barrel (keeps the barrel's other modules out of the page chunks).
import { SPRINGS, springLinear, type SpringName } from '../primitives/spring';

export interface MotionProfile {
  /** Travel of an entrance, px. */
  distance: number;
  /** Start scale of a zoom entrance. */
  scale: number;
  /** Length of an entrance, ms. */
  enter: number;
  /** Length of an exit, ms. */
  exit: number;
  /** Delay between neighbours in a stagger, ms. */
  stagger: number;
  /** The spring whose curve entrances, exits and layout moves follow. */
  spring: SpringName;
  /** Tilt towards the pointer, degrees. */
  tilt: number;
  /** Scale under the pointer. */
  lift: number;
  /** Pull towards the pointer, 0–1. */
  magnetic: number;
  /** Depth of 3D moves, px. */
  perspective: number;
}

/** The tokens the profile reads, by profile field. */
export const MOTION_TOKENS = {
  distance: '--ui-motion-distance',
  scale: '--ui-motion-scale',
  enter: '--ui-motion-enter',
  exit: '--ui-motion-exit',
  stagger: '--ui-motion-stagger',
  spring: '--ui-motion-spring',
  tilt: '--ui-motion-tilt',
  lift: '--ui-motion-lift',
  magnetic: '--ui-motion-magnetic',
  perspective: '--ui-motion-perspective',
} as const;

/** `180ms`, `0.3s` or a bare number of ms as milliseconds; undefined when it is not a time. */
export function parseTime(raw: string | undefined): number | undefined {
  const match = /^\s*(\d*\.?\d+)\s*(ms|s)?\s*$/i.exec(raw ?? '');
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  return match[2]?.toLowerCase() === 's' ? value * 1000 : value;
}

const number = (raw: string | undefined, fallback: number) => {
  const value = parseFloat(raw ?? '');
  return Number.isFinite(value) ? value : fallback;
};

const isSpring = (name: string): name is SpringName => name in SPRINGS;

/**
 * The profile from raw token values (as getComputedStyle returns them; missing ones are empty). Pure:
 * `duration` and `durationSlow` are the theme's `--ui-duration` and `--ui-duration-slow`.
 */
export function resolveMotionProfile(tokens: Partial<Record<keyof typeof MOTION_TOKENS | 'duration' | 'durationSlow', string>>): MotionProfile {
  const base = parseTime(tokens.duration) ?? 200;
  const slow = parseTime(tokens.durationSlow) ?? 340;
  const spring = (tokens.spring ?? '').trim();
  return {
    distance: number(tokens.distance, 24),
    scale: number(tokens.scale, 0.94),
    enter: parseTime(tokens.enter) ?? Math.round(slow * 2.2),
    exit: parseTime(tokens.exit) ?? base,
    stagger: parseTime(tokens.stagger) ?? Math.round(base * 0.35),
    spring: isSpring(spring) ? spring : 'snappy',
    tilt: number(tokens.tilt, 8),
    lift: number(tokens.lift, 1.02),
    magnetic: number(tokens.magnetic, 0.3),
    perspective: number(tokens.perspective, 900),
  };
}

/** The motion profile in effect at `element` (one style read). Browser only. */
export function readMotionProfile(element: Element): MotionProfile {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name);
  const tokens: Record<string, string> = { duration: read('--ui-duration'), durationSlow: read('--ui-duration-slow') };
  for (const [key, name] of Object.entries(MOTION_TOKENS)) tokens[key] = read(name);
  return resolveMotionProfile(tokens);
}

const easings = new Map<SpringName, string>();

/** The CSS easing of a named spring: its `linear()` curve, or a cubic-bezier of the same character. */
export function springCurve(name: SpringName): string {
  let easing = easings.get(name);
  if (easing) return easing;
  const supported = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)');
  easing = supported
    ? springLinear(SPRINGS[name])
    : name === 'bouncy'
      ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      : name === 'snappy'
        ? 'cubic-bezier(0.2, 0.9, 0.3, 1.04)'
        : 'cubic-bezier(0.22, 1, 0.36, 1)';
  easings.set(name, easing);
  return easing;
}
