let expectedPath: string | null = null;
let arriving = false;

const samePath = (left: string, right: string) => left.replace(/\/+$/, '') === right.replace(/\/+$/, '');

/**
 * Called when a link navigation starts, with the destination pathname. Only
 * that commit gets an entrance (`RouteTransition`): Back/Forward, refreshes,
 * query/hash-only changes and a superseded destination change the page
 * without motion.
 */
export function expectRouteEntrance(pathname: string): void {
  expectedPath = pathname;
}

/** Consumes the expectation at a commit; true when `pathname` is the expected destination. */
export function takeExpectedRouteEntrance(pathname: string): boolean {
  const expected = expectedPath !== null && samePath(expectedPath, pathname);
  expectedPath = null;
  return expected;
}

/** True while a navigated page's content is still replacing its skeletons; nested settles stand aside. */
export function routeEntranceActive(): boolean {
  return arriving;
}

export function setRouteEntranceActive(active: boolean): void {
  arriving = active;
}
