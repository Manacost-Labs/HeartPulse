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

/** Marks a prerender read: Express answers 503 instead of a last-good copy, which would sit in the data cache. */
export const PRERENDER_FRESH_HEADER = 'X-Hearthpulse-Prerender';

/**
 * Anonymous read of a public Express JSON projection. It never sends viewer
 * cookies, never follows redirects and gives up after ten seconds (or `timeoutMs`), so paid or
 * personal data cannot reach shared server-rendered HTML. The path must be
 * origin-relative (`/api/...`) and may carry a query string. A caller's signal
 * can shorten the deadline and cancel a body that is still being read.
 * `revalidate` (seconds) is for prerendered pages; the default never caches.
 */
export function fetchPublicExpress(path: string, signal?: AbortSignal, options: { revalidate?: number; timeoutMs?: number; freshOnly?: boolean } = {}): Promise<Response> {
  // An absolute or protocol-relative URL would leave the loopback origin.
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Express path must be origin-relative');
  }
  // A prerendered page passes its `revalidate`: the read joins the page's
  // regeneration instead of making the route dynamic (`no-store`).
  const caching: RequestInit = options.revalidate
    ? { next: { revalidate: options.revalidate } } as RequestInit
    : { cache: 'no-store' };
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 10_000);
  return fetch(new URL(path, expressOrigin()), {
    ...caching, credentials: 'omit', redirect: 'error',
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    // A prerender read lands in Next's data cache for `revalidate` seconds: the source must not answer it with a last-good copy.
    headers: options.freshOnly ? { Accept: 'application/json', [PRERENDER_FRESH_HEADER]: '1' } : { Accept: 'application/json' },
  });
}
