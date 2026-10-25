/**
 * Cache-Control of the anonymous public documents. Next sends `no-store` on
 * every dynamic page, which keeps the page out of the browser's back/forward
 * cache: Back reloads, hydrates and re-requests everything. Their HTML never
 * holds viewer or paid data (`usePublicAccess` fetches that in the browser),
 * so `private` (no shared cache) with `no-cache` (every normal visit
 * revalidates) is safe and lets Back restore the page as the visitor left it.
 * `usePublicAccess` re-checks the session on such a restore. The header is set
 * before rendering, so a 404 or 500 of these families carries it too; see
 * docs/specs/public-document-caching.md.
 *
 * This is an allowlist: a route family that is missing here keeps Next's
 * `no-store`. Pages whose HTML depends on cookies (`/admin/`, `/deck-builder/`,
 * `/archetypes/`) and the account, connect and profile pages stay out.
 * Prerendered pages (`/faq/`) are not listed: they carry their own caching and
 * are restorable already. `/` is answered in `proxy.ts`, because a header rule
 * cannot leave out the empty `?login` query. Sources carry the trailing slash
 * of the canonical URLs.
 */
export const PUBLIC_DOCUMENT_CACHE_CONTROL = 'private, no-cache';

/**
 * Tells the regional edge (`deploy/nginx/hearthpulse-shadow-app.conf`) that a
 * `200` of this document may be kept for every visitor that sends no cookie.
 * The edge stores only what a cookieless request received and hides this
 * header from the browser; `Cache-Control` stays `private` for browsers.
 */
export const PUBLIC_DOCUMENT_EDGE_CACHE_HEADER = 'X-HearthPulse-Edge-Cache';
export const PUBLIC_DOCUMENT_EDGE_CACHE_VALUE = 'anonymous';

/** Response headers of an anonymous public document. */
export const PUBLIC_DOCUMENT_RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': PUBLIC_DOCUMENT_CACHE_CONTROL,
  [PUBLIC_DOCUMENT_EDGE_CACHE_HEADER]: PUBLIC_DOCUMENT_EDGE_CACHE_VALUE,
});

export const PUBLIC_DOCUMENT_SOURCES = [
  '/:section(articles|classes|contests|gallery|leaderboards|legendaries|tierlist)/',
  '/battlegrounds/:tool(strategies|tier-builder|tier-list)/',
  '/:family(cosmetics|guides-archive|heroes|library|streamers)/:path*/',
  '/standard/:section(archetypes|cards|fun-decks|matchups|meta|patches|radar|vicious-gold)/:path*/',
];

/** `headers()` entries of `next.config.mjs`. */
export function publicDocumentHeaders() {
  return PUBLIC_DOCUMENT_SOURCES.map(source => ({
    source,
    headers: Object.entries(PUBLIC_DOCUMENT_RESPONSE_HEADERS).map(([key, value]) => ({ key, value })),
  }));
}

/** The home page is public; `/?login` is the account page and keeps `no-store`. */
export function isPublicHomeDocument(pathname, searchParams) {
  return pathname === '/' && !searchParams.has('login');
}
