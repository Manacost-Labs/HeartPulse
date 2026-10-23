/*
 * One visually hidden live region per page, for changes that have no visible text a screen reader would read on
 * its own: a new sort order, a drop target, a result count. Modelled on React Aria's live announcer: an assertive and
 * a polite log, each message its own node that is removed after `timeout`, so the region never grows and the same
 * message can be announced twice in a row. Plain DOM, no React: callable from any handler or effect, a no-op on the
 * server.
 */

export type Assertiveness = 'assertive' | 'polite';

/** On the announcer's root, so layers that hide the page from screen readers can leave it readable. */
export const LIVE_ANNOUNCER_ATTRIBUTE = 'data-live-announcer';

const DEFAULT_TIMEOUT = 7000;
// Some screen readers only watch a live region that was in the page before its content changed.
const NEW_REGION_DELAY = 100;

const HIDDEN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  border: '0',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

let root: HTMLElement | null = null;

function createRegion(assertiveness: Assertiveness) {
  const region = document.createElement('div');
  region.setAttribute('role', 'log');
  region.setAttribute('aria-live', assertiveness);
  region.setAttribute('aria-relevant', 'additions');
  return region;
}

/** The root in the page, created on first use; `created` when it was inserted just now. */
function ensureRoot(): { root: HTMLElement; created: boolean } {
  if (root?.isConnected) return { root, created: false };
  root = document.createElement('div');
  root.setAttribute(LIVE_ANNOUNCER_ATTRIBUTE, 'true');
  Object.assign(root.style, HIDDEN);
  root.append(createRegion('assertive'), createRegion('polite'));
  document.body.append(root);
  return { root, created: true };
}

function region(assertiveness: Assertiveness) {
  return root?.querySelector<HTMLElement>(`[aria-live="${assertiveness}"]`) ?? null;
}

/**
 * Reads `message` to screen-reader users. `assertive` interrupts (the result of what they just did: "Name, sorted
 * ascending"); `polite` waits for a pause (background updates). The message leaves the region after `timeout` ms.
 */
export function announce(message: string, assertiveness: Assertiveness = 'assertive', timeout = DEFAULT_TIMEOUT) {
  // No DOM (the server), or not a full one (a stubbed `document` in tests): nothing to read to.
  if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function' || !message) return;
  const { created } = ensureRoot();
  const add = () => {
    const target = region(assertiveness);
    if (!target) return;
    const node = document.createElement('div');
    node.textContent = message;
    target.append(node);
    setTimeout(() => node.remove(), timeout);
  };
  if (created) setTimeout(add, NEW_REGION_DELAY);
  else add();
}

/** Drops pending messages (both kinds when `assertiveness` is omitted), e.g. when the thing they describe is gone. */
export function clearAnnouncer(assertiveness?: Assertiveness) {
  for (const kind of assertiveness ? [assertiveness] : (['assertive', 'polite'] as const)) {
    const target = region(kind);
    if (target) target.textContent = '';
  }
}

/** Removes the announcer from the page (tests, micro-frontends unmounting); the next `announce` creates it again. */
export function destroyAnnouncer() {
  root?.remove();
  root = null;
}
