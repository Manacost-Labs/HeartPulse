import React from 'react';
import PublicProfilePage from '../../features/PublicProfilePage';
import ApplicationConnectPage from '../applicationConnect/public';

const LazyLoginPanel = React.lazy(() => import('../../features/DeferredRoutes')
  .then(module => ({ default: module.LoginPanel })));

type AccountRouteProps = {
  connect: boolean;
  profileId: string | null;
  user: React.ComponentProps<typeof ApplicationConnectPage>['initialAuthUser'];
  checking: boolean;
  onChange: React.ComponentProps<typeof ApplicationConnectPage>['onAuthChange'];
};

/**
 * Owns the three account-facing routes so the application shell only decides
 * whether it is on an account surface. Each route keeps its existing API and
 * the large legacy login bundle remains nested behind a lazy boundary.
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
      <ApplicationConnectPage
        initialAuthUser={user}
        parentAuthChecking={checking}
        onAuthChange={onChange}
      />
    );
  }
  if (profileId) return <PublicProfilePage publicProfileId={profileId} />;
  return (
    <LazyLoginPanel
      initialAuthUser={user}
      parentAuthChecking={checking}
      onAuthChange={onChange}
    />
  );
}
