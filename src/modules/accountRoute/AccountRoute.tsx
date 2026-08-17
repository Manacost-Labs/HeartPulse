import React from 'react';
import { loadLoginPanel, type AuthUser } from '../identity/public';

const LazyLoginPanel = React.lazy(loadLoginPanel);
const LazyApplicationConnectPage = React.lazy(() => import('../applicationConnect/public'));
const LazyPublicProfilePage = React.lazy(() => import('../../features/PublicProfilePage'));

type AccountRouteProps = {
  connect: boolean;
  profileId: string | null;
  user: AuthUser | null;
  checking: boolean;
  onChange: (user: AuthUser | null) => void;
};

/**
 * Owns the three account-facing routes so the application shell only decides
 * whether it is on an account surface. Each route keeps its existing API and
 * the identity-owned login bundle remains nested behind a lazy boundary.
 */
export default function AccountRoute({
  connect,
  profileId,
  user,
  checking,
  onChange,
}: AccountRouteProps) {
  if (connect) {
    return (
      <LazyApplicationConnectPage
        initialAuthUser={user}
        parentAuthChecking={checking}
        onAuthChange={onChange}
      />
    );
  }
  if (profileId) return <LazyPublicProfilePage publicProfileId={profileId} />;
  return (
    <LazyLoginPanel
      initialAuthUser={user}
      parentAuthChecking={checking}
      onAuthChange={onChange}
    />
  );
}
