'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  fetchCurrentAuthUser, canAccessAdminWorkspace, canManageContests,
  hasAuthSessionHint, markAuthSessionHint, clearAuthSessionHint, type AuthUser,
} from '@/src/modules/identity/public';
import { hasSubscriptionEntitlement, type SubscriptionStatus } from '@/src/modules/subscriptions/public';
import {
  GUEST_VIEWER, recordVerifiedAccount, recordVerifiedGrants, restoredPageMustHideViewer, verifiedViewer, viewerState,
} from './restoredPageAccess';

const sameAccount = (left: AuthUser | null, right: AuthUser | null) =>
  viewerState(left, null) === viewerState(right, null);

export function usePublicAccess() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [checking, setChecking] = useState(true);
  // The account on screen, and the viewer state the page shows (for a page
  // restored from the back/forward cache to compare with the last verified one).
  const shownUser = useRef<AuthUser | null>(null);
  const shownViewer = useRef(GUEST_VIEWER);
  useEffect(() => { shownViewer.current = viewerState(user, subscription); }, [user, subscription]);
  const showUser = useCallback((current: AuthUser | null) => {
    shownUser.current = current;
    setUser(current);
  }, []);
  const onAuthChange = useCallback((current: AuthUser | null) => {
    if (current) markAuthSessionHint();
    else clearAuthSessionHint();
    recordVerifiedAccount(current);
    showUser(current);
    setChecking(false);
    setSubscription(null);
    if (current) {
      void fetch('/api/subscription/status', { credentials: 'same-origin' })
        .then(response => response.ok ? response.json() as Promise<SubscriptionStatus> : null)
        .then(value => {
          setSubscription(value);
          if (sameAccount(shownUser.current, current)) recordVerifiedGrants(viewerState(current, value));
        })
        .catch(() => setSubscription(null));
    }
  }, [showUser]);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/subscription/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Request': '1' } });
    const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
    if (response.ok && shownUser.current) recordVerifiedGrants(viewerState(shownUser.current, value));
    setSubscription(value); return value;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | null = null;
    let latestRun = 0;
    // `quiet` re-checks a restored page that still shows the last verified
    // viewer: it stays as it is unless the server says otherwise. When that
    // re-check cannot reach the server, the page hides like any other.
    const verifySession = async (quiet = false) => {
      const run = ++latestRun;
      const superseded = () => controller.signal.aborted || run !== latestRun;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
      if (!quiet) setChecking(true);
      try {
        const current = await fetchCurrentAuthUser(controller.signal);
        if (superseded()) return;
        if (current) markAuthSessionHint();
        else clearAuthSessionHint();
        recordVerifiedAccount(current);
        const accountChanged = !sameAccount(current, shownUser.current);
        showUser(current);
        if (!quiet || accountChanged) setSubscription(null);
        if (quiet && accountChanged && current) setChecking(true);
        if (current) {
          const response = await fetch('/api/subscription/status', { credentials: 'same-origin', signal: controller.signal });
          if (response.status === 429 || response.status >= 500) {
            throw new Error('Subscription status is temporarily unavailable');
          }
          const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
          if (superseded()) return;
          recordVerifiedGrants(viewerState(current, value));
          setSubscription(value);
        }
      } catch {
        if (superseded()) return;
        if (quiet) {
          showUser(null);
          setSubscription(null);
        }
        if (hasAuthSessionHint()) {
          if (quiet) setChecking(true);
          retryTimer = window.setTimeout(() => { void verifySession(); }, 5_000);
        } else {
          clearAuthSessionHint();
          showUser(null);
          setSubscription(null);
        }
      } finally {
        if (!superseded() && retryTimer === null) setChecking(false);
      }
    };
    // A restored page must never show the viewer who left it to anyone else,
    // not even for one frame: unless the last verified viewer is the one on
    // screen, hide it synchronously, then ask the server.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (!restoredPageMustHideViewer(shownViewer.current, verifiedViewer())) {
        void verifySession(true);
        return;
      }
      flushSync(() => {
        showUser(null);
        setSubscription(null);
        setChecking(true);
      });
      void verifySession();
    };
    window.addEventListener('pageshow', onPageShow);
    void verifySession();
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      controller.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [showUser]);
  const admin = canAccessAdminWorkspace(user);
  return { user, subscription, checking, refresh, onAuthChange, contestAdmin: canManageContests(user), statsAccess: admin || hasSubscriptionEntitlement(subscription, 'standard'), admin };
}
