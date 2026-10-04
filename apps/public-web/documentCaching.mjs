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

export const PUBLIC_DOCUMENT_SOURCES = [
  '/:section(articles|classes|contests|gallery|legendaries|tierlist)/',
  '/battlegrounds/:tool(strategies|tier-builder|tier-list)/',
  '/:family(cosmetics|guides-archive|heroes|library)/:path*/',
  '/standard/:section(archetypes|cards|fun-decks|matchups|meta|vicious-gold)/:path*/',
];

/** `headers()` entries of `next.config.mjs`. */
export function publicDocumentHeaders() {
  return PUBLIC_DOCUMENT_SOURCES.map(source => ({
    source,
    headers: [{ key: 'Cache-Control', value: PUBLIC_DOCUMENT_CACHE_CONTROL }],
  }));
}

/** The home page is public; `/?login` is the account page and keeps `no-store`. */
export function isPublicHomeDocument(pathname, searchParams) {
  return pathname === '/' && !searchParams.has('login');
}
