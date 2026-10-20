'use client';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import {
  fetchCurrentAuthSession, canAccessAdminWorkspace, canManageContests,
  markAuthSessionHint, clearAuthSessionHint, type AuthUser,
} from '@/src/modules/identity/public';
import type { SubscriptionEntitlementKey, SubscriptionStatus } from '@/src/modules/subscriptions/public';
import {
  accessChecking, entitlementAccess, INITIAL_ACCESS_STATE, reduceAccess, type AccessEvent,
} from './accessState';
import {
  recordNamesAnotherViewer, recordVerifiedAccount, recordVerifiedGrants, verifiedViewer, viewerState,
} from './restoredPageAccess';
import { clearViewerHint, forgetViewerTag, readViewerHint, sessionTag, writeViewerHint } from './viewerHint';

// A session check that cannot finish ends here instead of keeping the page
// pending: a few retries within one deadline, then a state with a retry action.
const VERIFY_DEADLINE_MS = 10_000;
const RETRY_DELAYS_MS = [1_500, 3_000];
export const ACCESS_UNAVAILABLE_MESSAGE = 'Не удалось проверить доступ: сервер не ответил. Повторите проверку.';

/**
 * The subscription a page holds when the check gave up. It grants nothing;
 * the gate shows its message, and `refresh()` runs the check again.
 */
export type UnavailableSubscription = SubscriptionStatus & { unavailable: true };
const UNAVAILABLE: UnavailableSubscription = {
  hasAccess: false, entitlements: {}, source: 'unavailable', checkedAt: null, stale: true,
  message: ACCESS_UNAVAILABLE_MESSAGE, boosty: {}, patreon: {}, telegram: {}, unavailable: true,
};
const isUnavailable = (value: SubscriptionStatus | null) => Boolean((value as UnavailableSubscription | null)?.unavailable);
/** The access check gave up: the server confirmed neither a grant nor a refusal. */
export const accessUnavailable = isUnavailable;

/**
 * Records a server-confirmed viewer for restored pages and, with the session
 * tag captured when the account was confirmed, for the next page's instant access.
 */
function rememberVerifiedViewer(user: AuthUser, subscription: SubscriptionStatus | null, confirmedTag: string | null,
  sessionExpiresAt?: number) {
  recordVerifiedGrants(viewerState(user, subscription));
  writeViewerHint(user, subscription, confirmedTag, Date.now(), sessionExpiresAt);
}

/**
 * Lets the access placeholder say again that it checks access. The head
 * script's `data-hp-viewer` mark silences it for a remembered viewer, also in
 * server HTML that has not hydrated yet; it goes once no viewer is remembered
 * or the check makes that viewer pending again.
 */
const unmarkRememberedViewer = () => { delete document.documentElement.dataset.hpViewer; };

type PublicAccessSnapshot = ReturnType<typeof usePublicAccessState>;
export const PublicAccessContext = createContext<ReturnType<typeof usePublicAccessStore> | null>(null);

/** Per-layout snapshots: hydrate as a guest, then publish verified access before paint. */
export function usePublicAccessStore(access: PublicAccessSnapshot) {
  // A changing context invalidates dehydrated Suspense boundaries, even when
  // their content does not read it. Notify hydrated readers instead, keeping
  // server HTML visible while its lazy chunks arrive.
  const [store] = useState(() => {
    let current = access;
    const listeners = new Set<() => void>();
    return {
      getSnapshot: () => current,
      getServerSnapshot: () => access,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      publish: (value: PublicAccessSnapshot) => {
        if (value === current) return;
        current = value;
        listeners.forEach(listener => listener());
      },
    };
  });
  // Access revocations must reach readers before the next paint, including
  // synchronous hiding on a back/forward-cache restore.
  useLayoutEffect(() => { store.publish(access); }, [store, access]);
  return store;
}

export function usePublicAccess() {
  const store = useContext(PublicAccessContext);
  if (!store) throw new Error('Public access requires the application layout');
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/**
 * The viewer's access for the whole layout, as one explicit state
 * (accessState.ts) that every paid page reads. Server HTML and hydration render
 * a guest that is still checking. A browser that remembers this session's
 * viewer (viewerHint.ts) shows it before the first client paint; the session
 * check then confirms or replaces it. Every server answer is dropped unless it
 * is about the session this browser holds now.
 */
export function usePublicAccessState(routeKey: string) {
  const [state, setState] = useState(INITIAL_ACCESS_STATE);
  // The state the effects read synchronously, ahead of the next render.
  const current = useRef(state);
  const apply = useCallback((event: AccessEvent) => {
    current.current = reduceAccess(current.current, event);
    setState(current.current);
  }, []);
  const rememberedOnMount = useRef(false);
  const retryVerification = useRef<(() => void) | null>(null);
  const cancelRetry = useRef<(() => void) | null>(null);
  const verifyOnNavigation = useRef<(() => void) | null>(null);
  const previousRoute = useRef(routeKey);
  const requestGeneration = useRef(0);
  // The server no longer knows the session: a guest, everywhere in this browser.
  const loseSession = useCallback(() => {
    clearAuthSessionHint();
    clearViewerHint();
    recordVerifiedAccount(null);
    apply({ type: 'guest' });
  }, [apply]);
  const onAuthChange = useCallback((signedIn: AuthUser | null) => {
    const generation = ++requestGeneration.current;
    // The caller's answer does not name its session, so this account is not
    // remembered for instant access here; the next session check does that.
    const sessionAtChange = sessionTag();
    cancelRetry.current?.();
    if (signedIn) markAuthSessionHint();
    else {
      clearAuthSessionHint();
      clearViewerHint();
    }
    recordVerifiedAccount(signedIn);
    if (!signedIn) {
      apply({ type: 'guest' });
      return;
    }
    apply({ type: 'signed-in', viewer: signedIn });
    // Re-checked after every await, right before acting: still this sign-in,
    // the same session, and no other viewer confirmed meanwhile.
    const stillCurrent = () => generation === requestGeneration.current
      && sessionTag() === sessionAtChange && !recordNamesAnotherViewer(signedIn);
    const stale = () => {
      // Another tab signed in or out meanwhile: this answer may be that session's.
      if (generation === requestGeneration.current) retryVerification.current?.();
    };
    void fetch('/api/subscription/status', { credentials: 'same-origin' })
      .then(async response => {
        if (!stillCurrent()) return stale();
        if (response.status === 401) {
          loseSession();
          return;
        }
        if (response.status === 429 || response.status >= 500) {
          apply({ type: 'unavailable', viewer: signedIn });
          return;
        }
        const value = response.ok ? await response.json() as SubscriptionStatus : null;
        if (!stillCurrent()) return stale();
        apply({ type: 'confirmed', viewer: signedIn, grants: value });
        recordVerifiedGrants(viewerState(signedIn, value));
      })
      .catch(() => { if (generation === requestGeneration.current) apply({ type: 'unavailable', viewer: signedIn }); });
  }, [apply, loseSession]);
  const refresh = useCallback(async () => {
    // After a check that gave up, the gate's button runs the check again.
    if (current.current.phase === 'unavailable') {
      retryVerification.current?.();
      return UNAVAILABLE;
    }
    const generation = requestGeneration.current;
    const sessionAtRefresh = sessionTag();
    const viewer = current.current.viewer;
    // Re-checked after every await: the same check, session and account.
    const stillCurrent = () => generation === requestGeneration.current && sessionTag() === sessionAtRefresh
      && current.current.viewer === viewer && !recordNamesAnotherViewer(viewer);
    const response = await fetch('/api/subscription/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Request': '1' } });
    if (!stillCurrent()) {
      // Another tab changed the session meanwhile: this answer may be that session's.
      if (generation === requestGeneration.current) retryVerification.current?.();
      return null;
    }
    if (response.status === 401) {
      loseSession();
      return null;
    }
    // A failed refresh changes nothing: neither a grant nor a refusal.
    if (!response.ok) return null;
    const value = await response.json() as SubscriptionStatus;
    if (!stillCurrent()) {
      if (generation === requestGeneration.current) retryVerification.current?.();
      return null;
    }
    // The account was confirmed earlier, under a session that may have changed
    // since: only the restored-page record is refined here, not the hint.
    if (viewer) recordVerifiedGrants(viewerState(viewer, value));
    apply({ type: 'refreshed', grants: value });
    return value;
  }, [apply, loseSession]);
  // Before the first client paint, show the viewer this browser remembers for
  // this session instead of the guest placeholder from the server HTML.
  useLayoutEffect(() => {
    const remembered = readViewerHint();
    if (!remembered) {
      unmarkRememberedViewer();
      return;
    }
    rememberedOnMount.current = true;
    apply({ type: 'remembered', viewer: remembered.user, grants: remembered.subscription });
  }, [apply]);
  useEffect(() => {
    const controller = new AbortController();
    // Each attempt has its own deadline; unmounting aborts every attempt.
    const attempts = new Set<AbortController>();
    let retryTimer: number | null = null;
    // After a back/forward-cache restore every check, the gate's retry
    // included, publishes a viewer only together with its subscription,
    // until one check has confirmed both.
    let atomicUntilConfirmed = false;
    // `quiet` re-checks a page that already shows a viewer (remembered, or on
    // a route change): it stays as it is unless the server says otherwise.
    // A check that cannot finish retries within one deadline, then leaves the
    // page `unavailable` (a retry, never a lock) with the account it could
    // confirm, if that may be shown.
    const verifySession = async (quiet = false,
      series = { deadline: performance.now() + VERIFY_DEADLINE_MS, retries: 0, atomic: false }) => {
      const run = ++requestGeneration.current;
      const superseded = () => controller.signal.aborted || run !== requestGeneration.current;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
      const attempt = new AbortController();
      attempts.add(attempt);
      const deadlineTimer = window.setTimeout(() => attempt.abort(), Math.max(0, series.deadline - performance.now()));
      let confirmed: AuthUser | null = null;
      const recordAtStart = verifiedViewer();
      const atomic = series.atomic || atomicUntilConfirmed;
      if (!quiet) {
        unmarkRememberedViewer();
        apply({ type: 'checking' });
      }
      try {
        const { user: answer, viewerSession, sessionExpiresAt } = await fetchCurrentAuthSession(attempt.signal);
        if (superseded()) return;
        // The answer names the session it read. If this browser holds another
        // one by now (a sign-in or sign-out in another tab while it was on its
        // way), or another page of ours confirmed another viewer meanwhile, it
        // is not about the current viewer: nothing of it is shown, remembered
        // or acted on, and the check runs again. An API that does not name the
        // session (an older build during a deploy) is trusted, but nothing is
        // remembered from it.
        const confirmedTag = viewerSession === undefined ? null : viewerSession;
        const sessionChanged = (since?: string | null) => (viewerSession !== undefined && sessionTag() !== viewerSession)
          || recordNamesAnotherViewer(answer, since);
        if (sessionChanged(recordAtStart)) throw new Error('The session changed during the check');
        if (answer) markAuthSessionHint();
        else {
          clearAuthSessionHint();
          clearViewerHint();
          // A guest answer for exactly the tag this browser still holds: that
          // session is over, so its tag goes (no await since the check above).
          if (viewerSession) forgetViewerTag();
        }
        recordVerifiedAccount(answer);
        confirmed = answer;
        apply({ type: 'session', viewer: answer, publish: !atomic, quiet });
        if (answer) {
          const response = await fetch('/api/subscription/status', { credentials: 'same-origin', signal: attempt.signal });
          if (superseded()) return;
          // Checked before anything else, a 401 included: a stale answer must
          // not wipe what the new session wrote.
          if (sessionChanged()) {
            confirmed = null;
            throw new Error('The session changed during the check');
          }
          if (response.status === 401) {
            // The session ended between the two answers.
            confirmed = null;
            atomicUntilConfirmed = false;
            loseSession();
            return;
          }
          if (response.status === 429 || response.status >= 500) {
            throw new Error('Subscription status is temporarily unavailable');
          }
          const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
          if (superseded()) return;
          if (sessionChanged()) {
            confirmed = null;
            throw new Error('The session changed during the check');
          }
          rememberVerifiedViewer(answer, value, confirmedTag, sessionExpiresAt);
          apply({ type: 'confirmed', viewer: answer, grants: value });
        }
        atomicUntilConfirmed = false;
      } catch {
        if (superseded()) return;
        // Whatever this browser remembers, an unfinished check is neither a
        // grant nor a refusal: retry within the deadline, then `unavailable`.
        if (quiet) apply({ type: 'hidden' });
        const retryDelay = RETRY_DELAYS_MS[series.retries];
        if (retryDelay !== undefined && performance.now() + retryDelay < series.deadline) {
          unmarkRememberedViewer();
          retryTimer = window.setTimeout(() => {
            void verifySession(false, { ...series, retries: series.retries + 1 });
          }, retryDelay);
        } else {
          apply({ type: 'unavailable', viewer: atomic ? null : confirmed });
        }
      } finally {
        window.clearTimeout(deadlineTimer);
        attempts.delete(attempt);
      }
    };
    // A restored page must never show the viewer who left it to anyone else,
    // not even for one frame, and never a gate the server has not confirmed.
    // While it was frozen the session may have been revoked, replaced or
    // started (a guest page whose visitor signed in elsewhere), without any
    // page of ours hearing of it. So every restored page hides its viewer and
    // paid views and turns pending before its first frame, then shows a
    // viewer only with a confirmed subscription (bounded by the deadline).
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      atomicUntilConfirmed = true;
      flushSync(() => apply({ type: 'hidden' }));
      void verifySession(false, { deadline: performance.now() + VERIFY_DEADLINE_MS, retries: 0, atomic: true });
    };
    verifyOnNavigation.current = () => { void verifySession(true); };
    retryVerification.current = () => { void verifySession(); };
    cancelRetry.current = () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
    };
    window.addEventListener('pageshow', onPageShow);
    void verifySession(rememberedOnMount.current);
    return () => {
      verifyOnNavigation.current = null;
      retryVerification.current = null;
      cancelRetry.current = null;
      window.removeEventListener('pageshow', onPageShow);
      controller.abort();
      attempts.forEach(attempt => attempt.abort());
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [apply, loseSession]);
  useEffect(() => {
    if (previousRoute.current === routeKey) return;
    previousRoute.current = routeKey;
    verifyOnNavigation.current?.();
  }, [routeKey]);
  return useMemo(() => {
    const user = state.viewer;
    const admin = canAccessAdminWorkspace(user);
    return {
      state, user, admin, refresh, onAuthChange,
      // Kept for consumers that predate the state: the confirmed (or
      // remembered) subscription, or the failed check's status.
      subscription: state.phase === 'unavailable' ? UNAVAILABLE : state.grants,
      checking: accessChecking(state),
      // The account shown is remembered, not confirmed yet (account pages wait).
      provisional: state.source === 'remembered',
      contestAdmin: canManageContests(user),
      statsAccess: entitlementAccess(state, 'standard') === 'granted',
    };
  }, [state, refresh, onAuthChange]);
}

/**
 * What a paid page may show for `entitlement` (accessState.ts): its paid view
 * when `allowed`, its loading state while `pending`, a retry when the check
 * was `unavailable`, and the lock or paywall only when the server confirmed
 * the refusal (`denied`).
 */
export function paidAccess(access: Pick<PublicAccessSnapshot, 'state'>, entitlement: SubscriptionEntitlementKey) {
  const value = entitlementAccess(access.state, entitlement);
  return { allowed: value === 'granted', pending: value === 'pending', unavailable: value === 'unavailable', denied: value === 'denied' };
}
