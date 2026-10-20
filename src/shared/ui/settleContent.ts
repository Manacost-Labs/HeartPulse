import { motionEasing, motionMs, prefersReducedMotion } from './motionTokens';

/** Short compositor-only reveal; the caller owns cancellation on replacement or unmount. */
export function settleContent(content: HTMLElement): Animation | undefined {
  if (!content.animate || prefersReducedMotion()) return;
  const duration = motionMs('--motion-base', content);
  if (!duration) return;
  return content.animate([{ opacity: 0.8 }, { opacity: 1 }], { duration, easing: motionEasing('--motion-ease', content) });
}
