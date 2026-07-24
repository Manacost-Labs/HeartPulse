export function normalizeClassKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function classIconUrl(value: unknown): string {
  const classKey = normalizeClassKey(value);
  return classKey && classKey !== 'unknown'
    ? `/class_icon/ui/${classKey}-64.webp`
    : '/class_icon/neutral.webp';
}

export function useNeutralClassIcon(image: HTMLImageElement): void {
  if (!image.src.endsWith('/class_icon/neutral.webp')) {
    image.src = '/class_icon/neutral.webp';
  }
}
