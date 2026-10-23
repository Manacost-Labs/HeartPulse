/**
 * Milliseconds of a `--motion-*` duration token (src/styles/tokens.css), so
 * script timers keep the site's tempo. Returns 0 when the token is missing or
 * unreadable; callers treat that as "no motion".
 */
export function motionMs(token: string, element: Element = document.documentElement): number {
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  const duration = Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

/** The `--motion-ease*` curve for script animations; CSS's default ease when absent. */
export function motionEasing(token: '--motion-ease' | '--motion-ease-exit', element: Element = document.documentElement): string {
  return getComputedStyle(element).getPropertyValue(token).trim() || 'ease';
}

export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * How visible content that takes another content's place starts its entrance.
 * The parchment behind the site is much lighter than most content: an entrance
 * from `opacity: 0` shows an empty, bright page for a frame or two (a blink),
 * and a whole-page dip from 0.8 read as a flicker too (2026-10-18). So a
 * navigated page or switched view keeps full opacity and only its motion
 * (rise, slide, zoom) carries the change; a section that replaces its own
 * skeleton, whose spot was already marked, settles from a light dip.
 */
export const ENTRANCE_OPACITY_FLOOR = {
  /** A navigated page or a switched view: the old one vanished in the same frame. */
  page: 1,
  /** A section replacing its skeleton. */
  section: 0.6,
} as const;

/** `keyframes` with every opacity lifted onto [floor, 1]; frames without opacity are untouched. */
export function withOpacityFloor(keyframes: Keyframe[], floor: number): Keyframe[] {
  return keyframes.map(frame => {
    if (frame.opacity === undefined || frame.opacity === null) return frame;
    const opacity = Number(frame.opacity);
    return Number.isFinite(opacity) ? { ...frame, opacity: floor + (1 - floor) * opacity } : frame;
  });
}
