/** Public hs-data-api root, used when `HS_DATA_API_BASE_URL` is not set. */
export const DEFAULT_HS_DATA_API_ORIGIN = 'https://api.kolodahearthstone.com';

/**
 * Deadline for one hs-data-api dataset read. Without it a stalled upstream
 * keeps sockets and request handlers open until nginx answers 504, which
 * piles load onto an already overloaded host.
 */
export const HS_DATA_API_TIMEOUT_MS = 12_000;

/**
 * Resolves the hs-data-api root (`HS_DATA_API_BASE_URL`, for example the
 * loopback upstream) without a trailing slash, so callers append `/path`.
 */
export function hsDataApiOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return (env.HS_DATA_API_BASE_URL || DEFAULT_HS_DATA_API_ORIGIN).replace(/\/+$/, '');
}
