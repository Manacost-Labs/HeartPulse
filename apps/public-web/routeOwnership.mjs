/** Catalogs and details move together; APIs and assets retain legacy ownership. */
export function publicWebOwner(pathname, enabled = false, method = 'GET') {
  if (!enabled || !['GET', 'HEAD'].includes(method)) return 'legacy';
  if (pathname.startsWith('/_next/') || /^\/health\/next\/?$/.test(pathname)) return 'next';
  // Include invalid descendants so the enabled owner provides the real 404.
  return /^\/standard\/cards(?:\/.*)?$/.test(pathname) ? 'next' : 'legacy';
}
