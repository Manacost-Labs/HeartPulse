import { canAccessAdminWorkspace, canManageContests, type AuthUser } from '@/src/modules/identity/public';
import type { SubscriptionStatus } from '@/src/modules/subscriptions/public';

// Public documents may come back from the back/forward cache with the viewer
// state they had when the visitor left (see documentCaching.mjs). The session
// cookie is HttpOnly, so every page writes what the server last told it about
// the viewer: who it is and what it may open. A restored page shows its old
// viewer only while that record still names exactly that viewer. The record
// grants nothing; it only decides whether the page hides before asking again.
const VERIFIED_VIEWER_KEY = 'hs_arena_verified_viewer';
export const GUEST_VIEWER = 'guest';

// Equality is all the record needs, so it stores a digest, not the account id.
function digest(value: string): string {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return (4294967296 * (2097151 & second) + (first >>> 0)).toString(36);
}

/**
 * The viewer a page shows, as `account:grants`, or `guest`. The account part
 * covers the account and its administrator roles (both come with the session
 * answer), the grants part the subscription entitlements; a subscription
 * that is not known yet, or grants nothing, leaves it empty.
 */
export function viewerState(user: AuthUser | null, subscription: SubscriptionStatus | null): string {
  if (!user) return GUEST_VIEWER;
  const roles = `${canAccessAdminWorkspace(user) ? 'admin' : ''}${canManageContests(user) ? '+contests' : ''}`;
  const entitlements = Object.entries(subscription?.entitlements ?? {})
    .filter(([, granted]) => granted === true).map(([name]) => name).sort().join(',');
  const grants = subscription?.hasAccess || entitlements
    ? digest(`${subscription?.hasAccess ? 'access' : ''}|${entitlements}`) : '';
  return `${digest(`${user.id ?? user.email}|${roles}`)}:${grants}`;
}

/** Records the viewer the server just confirmed, for every page of this browser. */
export function recordVerifiedViewer(state: string): void {
  try {
    localStorage.setItem(VERIFIED_VIEWER_KEY, state);
  } catch {
    // A failed write must not leave the previous viewer's record behind; with
    // no record a restored page always hides.
    try { localStorage.removeItem(VERIFIED_VIEWER_KEY); } catch { /* storage disabled */ }
  }
}

const accountOf = (value: string | null) => value?.split(':')[0];

/**
 * Records a subscription answer. It can arrive after another tab ended this
 * account's session and signed someone else in, so it only refines the record
 * while that still names the same account; a guest record is never upgraded.
 */
export function recordVerifiedGrants(state: string): void {
  const recorded = verifiedViewer();
  if (recorded === null || recorded === GUEST_VIEWER || accountOf(recorded) !== accountOf(state)) return;
  recordVerifiedViewer(state);
}

/**
 * Records a session answer before the subscription answers. Another account
 * (or a guest) replaces the record at once; the same account keeps its last
 * confirmed grants until its own subscription answer replaces them, so a quick
 * Back to that account's page does not hide it for nothing.
 */
export function recordVerifiedAccount(user: AuthUser | null): void {
  const state = viewerState(user, null);
  if (user && accountOf(verifiedViewer()) === accountOf(state)) return;
  recordVerifiedViewer(state);
}

/** The viewer the server last confirmed to any page, or null when unknown. */
export function verifiedViewer(): string | null {
  try {
    return localStorage.getItem(VERIFIED_VIEWER_KEY);
  } catch {
    return null;
  }
}

/**
 * A restored page that shows a viewer hides it, with every paid view, unless
 * the server's last answer in this browser named exactly that viewer. A guest
 * page has nothing to hide.
 */
export function restoredPageMustHideViewer(shownViewer: string, lastVerifiedViewer: string | null): boolean {
  return shownViewer !== GUEST_VIEWER && shownViewer !== lastVerifiedViewer;
}
