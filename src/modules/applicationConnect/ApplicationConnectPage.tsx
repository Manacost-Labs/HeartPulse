import React, { useCallback, useEffect, useState } from 'react';
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

function responseError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return fallback;
  const code = String((error as { code?: unknown }).code ?? '');
  if (code === 'AUTHORIZATION_NOT_FOUND' || code === 'INVALID_AUTHORIZATION') {
    return 'Код не найден, уже использован или истёк. Запросите новый код в приложении.';
  }
  if (code === 'LOGIN_REQUIRED') return 'Войдите в аккаунт Manacost, чтобы продолжить.';
  return fallback;
}

export default function ApplicationConnectPage({
  initialAuthUser,
  parentAuthChecking,
  onAuthChange,
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
      const response = await fetch(
        `/api/v1/oauth/device/authorization?user_code=${encodeURIComponent(userCode)}`,
        { credentials: 'same-origin', cache: 'no-store', signal },
      );
      const payload = await response.json().catch(() => ({})) as {
        authorization?: DeviceAuthorization;
      };
      if (!response.ok || !payload.authorization) {
        throw new Error(responseError(payload, 'Не удалось проверить код. Повторите попытку.'));
      }
      setAuthorization(payload.authorization);
      setState('review');
    } catch (error) {
      if (signal?.aborted) return;
      setAuthorization(null);
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось проверить код.');
      setState('error');
    }
  }, [user, userCode]);

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
      const response = await fetch('/api/v1/oauth/device/approve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
        body: JSON.stringify({ user_code: userCode, decision }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseError(payload, 'Не удалось сохранить решение. Повторите попытку.'));
      }
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
