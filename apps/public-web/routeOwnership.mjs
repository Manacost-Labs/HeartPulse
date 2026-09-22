/** Card details move together; APIs, catalogs, assets and every other page stay legacy. */
export function publicWebOwner(pathname, enabled = false, method = 'GET') {
  if (!enabled || !['GET', 'HEAD'].includes(method)) return 'legacy';
  if (pathname.startsWith('/_next/') || /^\/health\/next\/?$/.test(pathname)) return 'next';
  // Include invalid identities so the enabled owner provides the real 404.
  return /^\/standard\/cards\/(standard|wild)\/[^/]+\/?$/.test(pathname) ? 'next' : 'legacy';
}
