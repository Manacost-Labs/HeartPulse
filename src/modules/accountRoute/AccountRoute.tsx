import React from 'react';
import {
  loadLoginPanel,
  type AuthUser,
} from '../identity/public';

const LazyLoginPanel = React.lazy(loadLoginPanel);
const LazyApplicationConnectPage = React.lazy(() => import('../applicationConnect/public'));

type AccountRouteProps = {
  connect: boolean;
  user: AuthUser | null;
  checking: boolean;
  onChange: (user: AuthUser | null) => void;
};

/**
 * Owns the account-facing routes (sign-in/account and application connect) so
 * the application shell only decides whether it is on an account surface. Each route keeps its existing API and
 * the identity-owned login bundle remains nested behind a lazy boundary.
 */
export default function AccountRoute({
  connect,
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
        loginPanelComponent={LazyLoginPanel}
      />
    );
  }
  return (
    <LazyLoginPanel
      key={checking ? 1 : 0}
      initialAuthUser={user}
      parentAuthChecking={checking}
      onAuthChange={onChange}
    />
  );
}
