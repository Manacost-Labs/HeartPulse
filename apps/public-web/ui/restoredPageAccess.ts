import { hasAuthSessionHint, type AuthUser } from '@/src/modules/identity/public';

// Public documents may come back from the back/forward cache with the
// viewer state they had when the visitor left (see documentCaching.mjs). The
// session cookie is HttpOnly, so a restored page compares what it can read:
// the session hint and the moment of the last sign-in or sign-out in this
// browser. Neither grants access; they only decide whether the restored page
// must hide its viewer state before the server answers again.
const VIEWER_CHANGE_KEY = 'hs_arena_viewer_changed_at';

/** Which viewer a page shows, or null for a guest. */
export function viewerKey(user: AuthUser | null): string | null {
  return user ? user.id ?? user.email : null;
}

/** Notes a sign-in, sign-out or account switch for the other open pages. */
export function recordViewerChange(): void {
  try {
    localStorage.setItem(VIEWER_CHANGE_KEY, String(Date.now()));
  } catch { /* Storage may be disabled; a restored page then always re-checks. */ }
}

/** What this browser knows about its session now; null when storage is unreadable. */
export function sessionSnapshot(): string | null {
  try {
    return `${hasAuthSessionHint() ? 'session' : 'guest'}:${localStorage.getItem(VIEWER_CHANGE_KEY) ?? ''}`;
  } catch {
    return null;
  }
}

/**
 * A restored page that shows a viewer hides that viewer, and with it any paid
 * view, before the session is checked again, unless the browser's session is
 * provably unchanged since the page last checked it. A guest page has nothing
 * to hide.
 */
export function restoredPageMustHideViewer(shownViewer: string | null, checkedSnapshot: string | null,
  currentSnapshot: string | null): boolean {
  if (shownViewer === null) return false;
  return checkedSnapshot === null || currentSnapshot === null || checkedSnapshot !== currentSnapshot;
}
