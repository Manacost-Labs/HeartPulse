export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * `behavior` for `scrollIntoView` and `scrollBy`: an explicit `'smooth'`
 * overrides the stylesheet's reduced-motion rule, so callers ask here and
 * get an instant jump for visitors who prefer reduced motion. Read at call
 * time (in a handler, effect or timer); on the server it answers `'smooth'`.
 */
export function preferredScrollBehavior(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth';
}
