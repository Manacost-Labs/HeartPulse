/**
 * Next's router does not join a navigation to a full prefetch that is still
 * downloading: it requests the same page again (seen in production as
 * 92 + 90 KB for /standard/cards/ on every early click). This observes the
 * router's own complete page responses (`RSC: 1` without the prefetch headers
 * of a partial or segment prefetch, which the router joins or completes itself),
 * so a click can wait for the response on its way.
 * Requests pass through untouched; only a clone is read to its end.
 */
export function observeRouteResponses(target: { fetch: typeof fetch } = window) {
  const inflight = new Map<string, Promise<void>>();
  const original = target.fetch;
  const observed: typeof fetch = (input, init) => {
    const response = original.call(target, input, init);
    const request = input instanceof Request ? input : null;
    const headers = new Headers(init?.headers ?? request?.headers);
    if (headers.get('rsc') === '1' && !headers.has('next-router-prefetch') && !headers.has('next-router-segment-prefetch')) {
      const url = new URL(request?.url ?? String(input), location.href);
      url.searchParams.delete('_rsc');
      const page = `${url.pathname}${url.search}`;
      const done = response.then(answer => answer.clone().arrayBuffer()).then(() => undefined, () => undefined);
      inflight.set(page, done);
      void done.then(() => { if (inflight.get(page) === done) inflight.delete(page); });
    }
    return response;
  };
  target.fetch = observed;
  return {
    /** Settles when the response already downloading for `page` (path and query) has arrived; null when none is. */
    pending(page: string): Promise<void> | null { return inflight.get(page) ?? null; },
    dispose() { if (target.fetch === observed) target.fetch = original; },
  };
}
