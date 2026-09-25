/** Public page families roll out independently; APIs stay on Express. */
export function publicWebOwner(pathname, enabled = false, method = 'GET', pagesEnabled = false, galleryEnabled = false) {
  if ((!enabled && !pagesEnabled && !galleryEnabled) || !['GET', 'HEAD'].includes(method)) return 'legacy';
  if (pathname.startsWith('/_next/') || /^\/health\/next\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && pathname === '/') return 'next';
  if (pagesEnabled && /^\/(?:faq|privacy|terms|developers\/api|articles|contests|classes|tierlist|legendaries|standard\/(?:matchups|meta|fun-decks|vicious-gold))\/?$/.test(pathname)) return 'next';
  if (galleryEnabled && /^\/gallery\/?$/.test(pathname)) return 'next';
  // Include invalid card descendants so the enabled owner provides the real 404.
  return enabled && /^\/standard\/cards(?:\/.*)?$/.test(pathname) ? 'next' : 'legacy';
}
