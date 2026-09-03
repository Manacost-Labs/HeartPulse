const ENTITY_DETAIL_PATH = /^\/(?:(?:standard|wild)\/cards\/[^/]+\/[^/]+|library\/(?:minions|spells)\/[^/]+|heroes\/[^/]+)$/;

function entityNameFromDocumentTitle(documentTitle: string | undefined): string | null {
  const separatorIndex = documentTitle?.indexOf(' — ') ?? -1;
  if (separatorIndex <= 0) return null;
  return documentTitle?.slice(0, separatorIndex).trim() || null;
}

export function subscriptionPaywallHeading(
  title: string,
  pathname = globalThis.location?.pathname,
  documentTitle = globalThis.document?.title,
): string {
  const normalizedPath = pathname?.replace(/\/$/, '') || '/';
  if (normalizedPath === '/tierlist') return 'Тир-лист карт Арены Hearthstone';
  if (normalizedPath === '/battlegrounds/tier-list') return 'Тир-лист БГ Hearthstone';
  if (ENTITY_DETAIL_PATH.test(normalizedPath)) return entityNameFromDocumentTitle(documentTitle) ?? title;
  return title;
}
