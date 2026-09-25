'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchCurrentAuthUser, canAccessAdminWorkspace, canManageContests,
  hasAuthSessionHint, markAuthSessionHint, clearAuthSessionHint, type AuthUser,
} from '../../../src/modules/identity/public';
import { hasSubscriptionEntitlement, type SubscriptionStatus } from '../../../src/modules/subscriptions/public';

export function usePublicAccess() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const onAuthChange = useCallback((current: AuthUser | null) => {
    if (current) markAuthSessionHint();
    else clearAuthSessionHint();
    setUser(current);
    setChecking(false);
    setSubscription(null);
    if (current) {
      void fetch('/api/subscription/status', { credentials: 'same-origin' })
        .then(response => response.ok ? response.json() as Promise<SubscriptionStatus> : null)
        .then(setSubscription)
        .catch(() => setSubscription(null));
    }
  }, []);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/subscription/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Request': '1' } });
    const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
    setSubscription(value); return value;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | null = null;
    const verifySession = async () => {
      retryTimer = null;
      setChecking(true);
      try {
        const current = await fetchCurrentAuthUser(controller.signal);
        if (controller.signal.aborted) return;
        if (current) markAuthSessionHint();
        else clearAuthSessionHint();
        setUser(current);
        setSubscription(null);
        if (current) {
          const response = await fetch('/api/subscription/status', { credentials: 'same-origin', signal: controller.signal });
          const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
          if (!controller.signal.aborted) setSubscription(value);
        }
      } catch {
        if (controller.signal.aborted) return;
        if (hasAuthSessionHint()) {
          retryTimer = window.setTimeout(() => { void verifySession(); }, 5_000);
        } else {
          clearAuthSessionHint();
          setUser(null);
          setSubscription(null);
        }
      } finally {
        if (!controller.signal.aborted && retryTimer === null) setChecking(false);
      }
    };
    void verifySession();
    return () => {
      controller.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, []);
  const admin = canAccessAdminWorkspace(user);
  return { user, subscription, checking, refresh, onAuthChange, contestAdmin: canManageContests(user), statsAccess: admin || hasSubscriptionEntitlement(subscription, 'standard'), admin };
}
