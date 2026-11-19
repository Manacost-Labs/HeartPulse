/**
 * Where `/?login&returnTo=…` sends the visitor after signing in: a page of this
 * site (a relative path, optionally with a query), so a paywall offer can bring
 * the visitor back to the group they were looking at. Anything else (another
 * host, `//`, a backslash, an API or the login page itself) is ignored and the
 * login behaves as it always did. The server checks the same address again
 * (`safeAuthReturnTo`) before it redirects.
 */
const PAGE_RETURN = /^\/(?!api\/)[a-z0-9\-/]*(?:\?[\w=&%.\-]*)?$/i;
const MAX_LENGTH = 300;

export function pageReturnTo(search: string): string {
  const value = new URLSearchParams(search).get('returnTo') ?? '';
  return value.length <= MAX_LENGTH && PAGE_RETURN.test(value) && !value.startsWith('//') ? value : '';
}

/** The address a paywall offer sends a guest to sign in with, returning to `page` afterwards. */
export function loginUrlReturningTo(page: string): string {
  return pageReturnTo(`?returnTo=${encodeURIComponent(page)}`) ? `/?login&returnTo=${encodeURIComponent(page)}` : '/?login';
}
