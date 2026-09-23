/** Catalogs/details and support pages roll out independently; APIs stay on Express. */
export function publicWebOwner(pathname, enabled = false, method = 'GET', pagesEnabled = false) {
  if ((!enabled && !pagesEnabled) || !['GET', 'HEAD'].includes(method)) return 'legacy';
  if (pathname.startsWith('/_next/') || /^\/health\/next\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/(faq|privacy|terms)\/?$/.test(pathname)) return 'next';
  // Include invalid card descendants so the enabled owner provides the real 404.
  return enabled && /^\/standard\/cards(?:\/.*)?$/.test(pathname) ? 'next' : 'legacy';
}
