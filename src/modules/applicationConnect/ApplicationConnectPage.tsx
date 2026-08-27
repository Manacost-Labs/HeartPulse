import React, { useCallback, useEffect, useState } from 'react';
import {
  applicationConnectApi,
  type ApplicationConnectApi,
} from './api/client';
import { ApplicationConnectView } from './ApplicationConnectView';
import {
  normalizedUserCode,
  type ConnectState,
  type ConnectUser,
  type DeviceAuthorization,
} from './applicationConnectModel';

type ApplicationConnectPageProps = {
  initialAuthUser: ConnectUser | null;
  parentAuthChecking: boolean;
  onAuthChange: (user: ConnectUser | null) => void;
  api?: ApplicationConnectApi;
};

const LazyLoginPanel = React.lazy(() => import('../../features/DeferredRoutes')
  .then(module => ({ default: module.LoginPanel })));

function initialUserCode(): string {
  return normalizedUserCode(new URLSearchParams(window.location.search).get('user_code') ?? '');
}

function updateConnectUrl(userCode: string, login = false): void {
  const params = new URLSearchParams();
  if (userCode) params.set('user_code', userCode);
  if (login) params.set('login', '');
  const query = params.toString().replace(/login=$/, 'login');
  window.history.replaceState(
    { ...(window.history.state ?? {}), routeKnown: true },
    '',
    `/connect/${query ? `?${query}` : ''}`,
  );
}

export default function ApplicationConnectPage({
  initialAuthUser,
  parentAuthChecking,
  onAuthChange,
  api = applicationConnectApi,
}: ApplicationConnectPageProps) {
  const user = initialAuthUser;
  const [userCode, setUserCode] = useState(initialUserCode);
  const [authorization, setAuthorization] = useState<DeviceAuthorization | null>(null);
  const [state, setState] = useState<ConnectState>('entry');
  const [errorMessage, setErrorMessage] = useState('');
  const [wantsLogin, setWantsLogin] = useState(
    () => new URLSearchParams(window.location.search).has('login'),
  );

  const inspect = useCallback(async (signal?: AbortSignal) => {
    if (userCode.length !== 9) {
      setAuthorization(null);
      setErrorMessage('Введите код в формате ABCD-2345.');
      setState('error');
      return;
    }
    if (!user) {
      updateConnectUrl(userCode, true);
      window.location.reload();
      return;
    }
    setState('loading');
    setErrorMessage('');
    updateConnectUrl(userCode);
    try {
      setAuthorization(await api.inspect(userCode, signal));
      setState('review');
    } catch (error) {
      if (signal?.aborted) return;
      setAuthorization(null);
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось проверить код.');
      setState('error');
    }
  }, [api, user, userCode]);

  useEffect(() => {
    if (!user || userCode.length !== 9 || wantsLogin) return undefined;
    const controller = new AbortController();
    void inspect(controller.signal);
    return () => controller.abort();
  }, [inspect, user, userCode, wantsLogin]);

  const decide = async (decision: 'approve' | 'deny') => {
    setState('submitting');
    setErrorMessage('');
    try {
      await api.decide(userCode, decision);
      setState(decision === 'approve' ? 'approved' : 'denied');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сохранить решение.');
      setState('error');
    }
  };

  const handleAuthChange = (nextUser: ConnectUser | null) => {
    onAuthChange(nextUser);
    if (nextUser) {
      updateConnectUrl(userCode);
      setWantsLogin(false);
      setState('entry');
    }
  };

  const loginPanel = !user && wantsLogin
    ? (
      <React.Suspense fallback={<div className="application-connect__loading">Загрузка формы входа…</div>}>
        <LazyLoginPanel
          initialAuthUser={initialAuthUser}
          parentAuthChecking={parentAuthChecking}
          onAuthChange={handleAuthChange}
        />
      </React.Suspense>
    )
    : undefined;

  return (
    <ApplicationConnectView
      state={parentAuthChecking && !user ? 'loading' : state}
      userCode={userCode}
      user={user}
      authorization={authorization}
      errorMessage={errorMessage}
      loginPanel={loginPanel}
      onCodeChange={setUserCode}
      onInspect={() => { void inspect(); }}
      onApprove={() => { void decide('approve'); }}
      onDeny={() => { void decide('deny'); }}
    />
  );
}
