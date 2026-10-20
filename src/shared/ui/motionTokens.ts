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
