import { canAccessAdminWorkspace, type AuthUser } from '@/src/modules/identity/public';
import { hasSubscriptionEntitlement, type SubscriptionEntitlementKey, type SubscriptionStatus } from '@/src/modules/subscriptions/public';
import { viewerState } from './restoredPageAccess';

/**
 * The viewer's access as one explicit state, the only source paid pages read
 * (docs/specs/instant-viewer-access.md). `usePublicAccess` turns the server's
 * answers into events, after dropping any answer about another session; this
 * module decides what the page shows.
 *
 * - `phase`: `unknown` before anything is known; `pending` while a check runs;
 *   `confirmed` once the server answered for the viewer on screen (a guest
 *   included); `unavailable` when the check gave up.
 * - `viewer`: the account on screen; `grants`: its subscription, remembered
 *   (`source: 'remembered'`) or confirmed by the server.
 */
export type AccessPhase = 'unknown' | 'pending' | 'confirmed' | 'unavailable';
export type ViewerSource = 'none' | 'remembered' | 'session' | 'sign-in';
export type AccessState = {
  phase: AccessPhase;
  viewer: AuthUser | null;
  grants: SubscriptionStatus | null;
  source: ViewerSource;
};

export const INITIAL_ACCESS_STATE: AccessState = { phase: 'unknown', viewer: null, grants: null, source: 'none' };

export type AccessEvent =
  /** This browser remembers the session's viewer (before the first client paint). */
  | { type: 'remembered'; viewer: AuthUser; grants: SubscriptionStatus }
  /** A page restored from the back/forward cache, or a quiet check that failed: show nobody, pending. */
  | { type: 'hidden' }
  /** A check starts that may change what is shown. */
  | { type: 'checking' }
  /**
   * The session answer. `publish: false` (a restored page) keeps the account
   * off screen until its subscription is confirmed; `quiet` keeps a confirmed
   * page as it is while the same account is re-checked.
   */
  | { type: 'session'; viewer: AuthUser | null; publish: boolean; quiet: boolean }
  /** Account and subscription both confirmed by the server. */
  | { type: 'confirmed'; viewer: AuthUser; grants: SubscriptionStatus | null }
  /** A sign-in or a profile answer: the account, its subscription still to come. */
  | { type: 'signed-in'; viewer: AuthUser }
  /** Sign-out, or the server no longer knows the session. */
  | { type: 'guest' }
  /** The check gave up; `viewer` is the account it could confirm, if it may be shown. */
  | { type: 'unavailable'; viewer: AuthUser | null }
  /** A subscription refresh for the account on screen. */
  | { type: 'refreshed'; grants: SubscriptionStatus | null };

const sameAccount = (left: AuthUser | null, right: AuthUser | null) =>
  Boolean(left && right) && viewerState(left, null) === viewerState(right, null);

const GUEST: AccessState = { phase: 'confirmed', viewer: null, grants: null, source: 'session' };

export function reduceAccess(state: AccessState, event: AccessEvent): AccessState {
  switch (event.type) {
    case 'remembered':
      return { phase: 'pending', viewer: event.viewer, grants: event.grants, source: 'remembered' };
    case 'hidden':
      return { phase: 'pending', viewer: null, grants: null, source: 'none' };
    case 'checking':
      return state.phase === 'pending' ? state : { ...state, phase: 'pending' };
    case 'session': {
      if (!event.viewer) return GUEST;
      const same = sameAccount(event.viewer, state.viewer);
      if (event.quiet && same) return state;
      if (!event.publish) return { phase: 'pending', viewer: null, grants: null, source: 'none' };
      return same
        ? { ...state, phase: 'pending', viewer: event.viewer }
        : { phase: 'pending', viewer: event.viewer, grants: null, source: 'session' };
    }
    case 'confirmed':
      return { phase: 'confirmed', viewer: event.viewer, grants: event.grants, source: 'session' };
    case 'signed-in':
      return { phase: 'pending', viewer: event.viewer, grants: null, source: 'sign-in' };
    case 'guest':
      return GUEST;
    case 'unavailable':
      return { phase: 'unavailable', viewer: event.viewer, grants: null, source: event.viewer ? 'session' : 'none' };
    case 'refreshed':
      return state.viewer ? { ...state, phase: 'confirmed', grants: event.grants } : state;
  }
}

/**
 * What a paid section shows for `entitlement`: its paid view when `granted`
 * (a confirmed or remembered grant, or an administrator), its loading state
 * when `pending`, the lock or paywall only when the server confirmed the
 * refusal (`denied`), and a retry when the check failed (`unavailable`).
 */
export type EntitlementAccess = 'granted' | 'pending' | 'denied' | 'unavailable';

export function entitlementAccess(state: AccessState, entitlement: SubscriptionEntitlementKey): EntitlementAccess {
  if (state.viewer && (canAccessAdminWorkspace(state.viewer) || hasSubscriptionEntitlement(state.grants, entitlement))) {
    return 'granted';
  }
  if (state.phase === 'confirmed') return 'denied';
  if (state.phase === 'unavailable') return 'unavailable';
  return 'pending';
}

/** Nothing is shown yet and a check runs: the session placeholder (account pages, header). */
export function accessChecking(state: AccessState): boolean {
  return (state.phase === 'unknown' || state.phase === 'pending') && state.source === 'none';
}
