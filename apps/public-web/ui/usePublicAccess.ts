'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchCurrentAuthUser, canAccessAdminWorkspace, canManageContests, type AuthUser } from '../../../src/modules/identity/public';
import { hasSubscriptionEntitlement, type SubscriptionStatus } from '../../../src/modules/subscriptions/public';

export function usePublicAccess() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/subscription/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Request': '1' } });
    const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
    setSubscription(value); return value;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const current = await fetchCurrentAuthUser(controller.signal);
        if (controller.signal.aborted) return;
        setUser(current);
        if (current) {
          const response = await fetch('/api/subscription/status', { credentials: 'same-origin', signal: controller.signal });
          const value: SubscriptionStatus | null = response.ok ? await response.json() : null;
          if (!controller.signal.aborted) setSubscription(value);
        }
      } finally { if (!controller.signal.aborted) setChecking(false); }
    })().catch(() => undefined);
    return () => controller.abort();
  }, []);
  const admin = canAccessAdminWorkspace(user);
  return { user, subscription, checking, refresh, contestAdmin: canManageContests(user), statsAccess: admin || hasSubscriptionEntitlement(subscription, 'standard'), admin };
}
