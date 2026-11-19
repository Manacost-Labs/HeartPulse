export function isPublicMediaApiRequest(method: string, path: string): boolean {
  const normalizedMethod = String(method).toUpperCase();
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') return false;
  return path.startsWith('/public-resource/') || path === '/article-cover';
}

const PUBLIC_DATA_MARKER_SEGMENTS = new Set(['public', 'teaser', 'public-teaser']);

function publicDataSegments(path: string): string[] {
  const clean = String(path).split('?')[0].replace(/^\/api(?=\/|$)/, '');
  return clean.split('/').filter(Boolean);
}

/**
 * Open JSON data endpoints of the E21 layer, matched by path pattern so that a
 * new `/public`, `/teaser` or `/public-teaser` route is covered automatically.
 * `path` is relative to the `/api` mount (a leading `/api` is also accepted).
 * Admin routes and the media routes handled by `isPublicMediaApiRequest` never match.
 */
export function isPublicDataApiRequest(method: string, path: string): boolean {
  const normalizedMethod = String(method).toUpperCase();
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') return false;
  const segments = publicDataSegments(path);
  if (segments.length === 0 || segments[0] === 'admin') return false;
  if (segments[0] === 'public' || segments[0] === 'fun-decks') return true;
  return segments.some(segment => PUBLIC_DATA_MARKER_SEGMENTS.has(segment));
}

/** Log-safe route template: keeps the path up to the marker, drops ids and slugs. */
export function publicDataRouteTemplate(path: string): string {
  const segments = publicDataSegments(path);
  const markerAt = segments.findIndex(segment => PUBLIC_DATA_MARKER_SEGMENTS.has(segment));
  if (segments[0] === 'fun-decks') return '/api/fun-decks';
  const kept = markerAt === -1 ? segments.slice(0, 2) : segments.slice(0, markerAt + 1);
  const hasMore = segments.length > kept.length;
  return `/api/${kept.join('/')}${hasMore ? '/*' : ''}`;
}
