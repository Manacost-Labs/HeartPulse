type Observer = Pick<IntersectionObserver, 'observe' | 'unobserve' | 'disconnect'>;
type ObserverFactory = (callback: (entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting' | 'target'>>) => void) => Observer;

/**
 * Prepares links once each when they become visible, so a tap on the menu
 * finds the route already known. `pathOf` returns null for links that stay
 * native; `allowed` is rechecked for every link (offline, Save-Data, 2G).
 * `scan` adds links rendered later; already observed links are skipped.
 */
export function createViewportPrefetch(prepare: (path: string) => void, allowed: () => boolean,
  pathOf: (link: HTMLAnchorElement) => string | null,
  createObserver: ObserverFactory = callback => new IntersectionObserver(callback)) {
  const seen = new WeakSet<Element>();
  const observer = createObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (!allowed()) continue;
      const path = pathOf(entry.target as HTMLAnchorElement);
      if (path) prepare(path);
    }
  });
  return {
    scan(links: Iterable<HTMLAnchorElement>) {
      for (const link of links) {
        if (seen.has(link)) continue;
        seen.add(link);
        observer.observe(link);
      }
    },
    dispose() { observer.disconnect(); },
  };
}
