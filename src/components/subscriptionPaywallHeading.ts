export function subscriptionPaywallHeading(title: string, pathname = globalThis.location?.pathname): string {
  const normalizedPath = pathname?.replace(/\/$/, '') || '/';
  if (normalizedPath === '/tierlist') return 'Тир-лист карт Арены Hearthstone';
  if (normalizedPath === '/battlegrounds/tier-list') return 'Тир-лист БГ Hearthstone';
  return title;
}
