/**
 * Loopback origin of the Express API for server-side reads. Production sets
 * `LEGACY_WEB_ORIGIN` in deploy/hs-arena-next.service; the fallback is the
 * local development API port.
 */
export function expressOrigin(): URL {
  let origin: URL;
  try {
    origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  } catch {
    throw new Error('Invalid legacy origin');
  }
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  return origin;
}

/**
 * Anonymous read of a public Express JSON projection. It never sends viewer
 * cookies, never follows redirects and gives up after ten seconds, so paid or
 * personal data cannot reach shared server-rendered HTML. The path must be
 * origin-relative (`/api/...`) and may carry a query string.
 */
export function fetchPublicExpress(path: string): Promise<Response> {
  // An absolute or protocol-relative URL would leave the loopback origin.
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Express path must be origin-relative');
  }
  return fetch(new URL(path, expressOrigin()), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
}
