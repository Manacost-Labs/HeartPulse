/** Short compositor-only reveal; the caller owns cancellation on replacement or unmount. */
export function settleContent(content: HTMLElement): Animation | undefined {
  if (!content.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const styles = getComputedStyle(content);
  const token = styles.getPropertyValue('--motion-base').trim();
  const duration = Number.parseFloat(token) * (token.endsWith('ms') ? 1 : 1000);
  if (!Number.isFinite(duration) || duration <= 0) return;
  return content.animate([{ opacity: 0.8 }, { opacity: 1 }], {
    duration, easing: styles.getPropertyValue('--motion-ease').trim(),
  });
}
