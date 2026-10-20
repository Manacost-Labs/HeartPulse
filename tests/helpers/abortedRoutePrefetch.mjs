/**
 * The public layout prepares visible menu routes while the browser is idle
 * (`_rsc` requests). Opening another document cancels those still on their
 * way; the reader never sees that, so it is not a failed page request.
 */
export function isAbortedRoutePrefetch(request) {
  return new URL(request.url()).searchParams.has('_rsc') && request.failure()?.errorText === 'net::ERR_ABORTED';
}

/**
 * An idle route prefetch of another menu page. Fixtures that serve only the
 * page under test answer those with 404; the page under test is unaffected.
 */
export function isMenuRoutePrefetch(request) {
  return new URL(request.url()).searchParams.has('_rsc') && request.headers()['next-router-prefetch'] === '1';
}

/** The browser's console note about such a prefetch's status. */
export function isRoutePrefetchConsoleMessage(message) {
  const url = message.location()?.url;
  return Boolean(url) && new URL(url).searchParams.has('_rsc');
}
