'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  fetchCurrentAuthUser, canAccessAdminWorkspace, canManageContests,
  hasAuthSessionHint, markAuthSessionHint, clearAuthSessionHint, type AuthUser,
} from '@/src/modules/identity/public';
import { hasSubscriptionEntitlement, type SubscriptionStatus } from '@/src/modules/subscriptions/public';
import { recordViewerChange, restoredPageMustHideViewer, sessionSnapshot, viewerKey } from './restoredPageAccess';

export function usePublicAccess() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [checking, setChecking] = useState(true);
  // The viewer on screen and the browser session state when it was last
  // checked: a page restored from the back/forward cache compares them.
  const shownViewer = useRef<string | null>(null);
  const checkedSnapshot = useRef<string | null>(null);
  const showUser = useCallback((current: AuthUser | null) => {
    shownViewer.current = viewerKey(current);
    setUser(current);
  }, []);
  const onAuthChange = useCallback((current: AuthUser | null) => {
    if (viewerKey(current) !== shownViewer.current) recordViewerChange();
    if (current) markAuthSessionHint();
    else clearAuthSessionHint();
    checkedSnapshot.current = sessionSnapshot();
    showUser(current);
    setChecking(false);
    setSubscription(null);
    if (current) {
      void fetch('/api/subscription/status', { credentials: 'same-origin' })
        .then(response => response.ok ? response.json() as Promise<SubscriptionStatus> : null)
        .then(setSubscription)
        .catch(() => setSubscription(null));
    }
  }, [showUser]);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/subscription/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Request': '1' } });
    const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
    setSubscription(value); return value;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | null = null;
    let latestRun = 0;
    // `quiet` re-checks a restored page that may keep what it shows: the
    // page stays as it is unless the viewer or the entitlement changed.
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
        const viewerChanged = viewerKey(current) !== shownViewer.current;
        showUser(current);
        if (!quiet || viewerChanged) setSubscription(null);
        if (quiet && viewerChanged && current) setChecking(true);
        if (current) {
          const response = await fetch('/api/subscription/status', { credentials: 'same-origin', signal: controller.signal });
          if (response.status === 429 || response.status >= 500) {
            throw new Error('Subscription status is temporarily unavailable');
          }
          const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
          if (!superseded()) setSubscription(value);
        }
      } catch {
        if (superseded()) return;
        if (hasAuthSessionHint()) {
          retryTimer = window.setTimeout(() => { void verifySession(quiet); }, 5_000);
        } else {
          clearAuthSessionHint();
          showUser(null);
          setSubscription(null);
        }
      } finally {
        if (!superseded()) {
          checkedSnapshot.current = sessionSnapshot();
          if (retryTimer === null) setChecking(false);
        }
      }
    };
    // A restored page must never show a signed-out or switched viewer the
    // previous one's header or paid view, not even for one frame: hide them
    // synchronously, then ask the server.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (!restoredPageMustHideViewer(shownViewer.current, checkedSnapshot.current, sessionSnapshot())) {
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
