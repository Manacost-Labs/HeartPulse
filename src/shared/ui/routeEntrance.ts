/** The default entrance: the content fades in place. */
const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

let expectedPath: string | null = null;
let expectedKeyframes: Keyframe[] = FADE;
let arriving = false;

const samePath = (left: string, right: string) => left.replace(/\/+$/, '') === right.replace(/\/+$/, '');

/**
 * Called when a link navigation starts, with the destination pathname. Only
 * that commit gets an entrance (`RouteTransition`): Back/Forward, refreshes,
 * query/hash-only changes and a superseded destination change the page
 * without motion. `keyframes` is the entrance the navigation chose (composition
 * picks a ValyroUI preset for the step); without it the content fades.
 */
export function expectRouteEntrance(pathname: string, keyframes: Keyframe[] = FADE): void {
  expectedPath = pathname;
  expectedKeyframes = keyframes;
}

/** Consumes the expectation at a commit: the entrance keyframes when `pathname` is the expected destination, else null. */
export function takeExpectedRouteEntrance(pathname: string): Keyframe[] | null {
  const expected = expectedPath !== null && samePath(expectedPath, pathname) ? expectedKeyframes : null;
  expectedPath = null;
  expectedKeyframes = FADE;
  return expected;
}

/** True while a navigated page's content is still replacing its skeletons; nested settles stand aside. */
export function routeEntranceActive(): boolean {
  return arriving;
}

export function setRouteEntranceActive(active: boolean): void {
  arriving = active;
}
