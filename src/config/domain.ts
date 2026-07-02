export const CANONICAL_HOST = 'arena.hs-manacost.ru';
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
export const WWW_HOST = `www.${CANONICAL_HOST}`;

export function getCanonicalRedirectUrl(location: Location): string {
  if (location.hostname !== WWW_HOST) return '';
  return `${CANONICAL_ORIGIN}${location.pathname}${location.search}${location.hash}`;
}
