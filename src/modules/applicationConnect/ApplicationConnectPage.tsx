import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  MonitorSmartphone,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import './applicationConnect.css';

type ConnectUser = {
  id?: string;
  email: string;
  name: string;
  role: string;
  avatarInitials?: string;
};

type DeviceAuthorization = {
  clientId: string;
  clientName: string;
  scopes: string[];
  expiresAt: number;
};

type ConnectState =
  | 'entry'
  | 'loading'
  | 'review'
  | 'submitting'
  | 'approved'
  | 'denied'
  | 'error';

type ApplicationConnectPageProps = {
  initialAuthUser: ConnectUser | null;
  parentAuthChecking: boolean;
  onAuthChange: (user: ConnectUser | null) => void;
};

type ApplicationConnectViewProps = {
  state: ConnectState;
  userCode: string;
  user: ConnectUser | null;
  authorization: DeviceAuthorization | null;
  errorMessage: string;
  loginPanel?: React.ReactNode;
  onCodeChange: (value: string) => void;
  onInspect: () => void;
  onApprove: () => void;
  onDeny: () => void;
};

const LazyLoginPanel = React.lazy(() => import('../../features/DeferredRoutes')
  .then(module => ({ default: module.LoginPanel })));

const SCOPE_LABELS: Readonly<Record<string, string>> = {
  'profile.read': 'Имя, e-mail и публичный ID профиля',
  'subscription.read': 'Статус подписки и доступные разделы',
  'catalog.read': 'Каталог данных Manacost API',
  'images.read': 'Изображения карт через защищённый API',
  'statistics.read': 'Статистика карт и история показателей',
};

const CONNECT_EXPIRY_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

function normalizedUserCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

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

export function ApplicationConnectView({
  state,
  userCode,
  user,
  authorization,
  errorMessage,
  loginPanel,
  onCodeChange,
  onInspect,
  onApprove,
  onDeny,
}: ApplicationConnectViewProps) {
  const busy = state === 'loading' || state === 'submitting';
  const completed = state === 'approved' || state === 'denied';
  const expiresAt = authorization
    ? CONNECT_EXPIRY_FORMATTER.format(new Date(authorization.expiresAt))
    : '';

  return (
    <article className="application-connect" aria-labelledby="application-connect-title">
      <header className="application-connect__header">
        <span className="application-connect__kicker"><ShieldCheck size={18} /> Безопасное подключение</span>
        <h1 id="application-connect-title">Подключение приложения</h1>
        <p>
          Подтвердите вход в Manacost Tracker. Приложение не увидит ваш пароль:
          разрешение выдаётся отдельным токеном, который можно отозвать.
        </p>
      </header>

      <div className="application-connect__body">
        {loginPanel ? (
          <section className="application-connect__login" aria-labelledby="application-connect-login-title">
            <h2 id="application-connect-login-title">Сначала войдите в аккаунт</h2>
            <p>После входа вы вернётесь к подтверждению кода на этой странице.</p>
            {loginPanel}
          </section>
        ) : completed ? (
          <section className="application-connect__result" aria-live="polite">
            <span className="application-connect__result-icon"><CheckCircle2 size={34} /></span>
            <h2>{state === 'approved' ? 'Приложение подключено' : 'Подключение отклонено'}</h2>
            <p>
              {state === 'approved'
                ? 'Вернитесь в Manacost Tracker — приложение завершит вход автоматически.'
                : 'Доступ не выдан. Можно безопасно закрыть эту страницу.'}
            </p>
          </section>
        ) : (
          <>
            <section className="application-connect__code" aria-labelledby="application-connect-code-title">
              <div>
                <h2 id="application-connect-code-title"><KeyRound size={20} /> Код из приложения</h2>
                <p>Введите восемь символов или проверьте код из открытой ссылки.</p>
              </div>
              <form onSubmit={(event) => { event.preventDefault(); onInspect(); }}>
                <label htmlFor="application-connect-code">Код подключения</label>
                <div>
                  <input
                    id="application-connect-code"
                    name="user_code"
                    value={userCode}
                    onChange={event => onCodeChange(normalizedUserCode(event.target.value))}
                    placeholder="ABCD-2345"
                    autoComplete="one-time-code"
                    inputMode="text"
                    spellCheck={false}
                    maxLength={9}
                    aria-describedby={errorMessage ? 'application-connect-error' : undefined}
                  />
                  <button type="submit" disabled={busy || userCode.length !== 9}>
                    {state === 'loading' ? 'Проверяем…' : 'Проверить код'}
                  </button>
                </div>
              </form>
            </section>

            {state === 'error' && (
              <div id="application-connect-error" className="application-connect__message is-error" role="alert">
                <AlertTriangle size={20} />
                <span>{errorMessage}</span>
              </div>
            )}

            {authorization && user && (
              <section className="application-connect__review" aria-labelledby="application-connect-review-title">
                <div className="application-connect__app">
                  <span aria-hidden="true"><MonitorSmartphone size={32} /></span>
                  <div>
                    <p>Запрашивает доступ</p>
                    <h2 id="application-connect-review-title">{authorization.clientName}</h2>
                    <small>Код действует до {expiresAt}</small>
                  </div>
                </div>

                <div className="application-connect__identity">
                  <UserRoundCheck size={22} aria-hidden="true" />
                  <div><span>Аккаунт</span><strong>{user.name}</strong><small>{user.email}</small></div>
                </div>

                <div className="application-connect__permissions">
                  <h3><LockKeyhole size={19} /> Приложение сможет читать</h3>
                  <ul>
                    {authorization.scopes.map(scope => (
                      <li key={scope}><CheckCircle2 size={17} /> {SCOPE_LABELS[scope] ?? scope}</li>
                    ))}
                  </ul>
                  <p>Приложение не сможет изменять профиль, подписку или данные сайта.</p>
                </div>

                <div className="application-connect__actions">
                  <button type="button" className="is-secondary" onClick={onDeny} disabled={busy}>
                    Отклонить
                  </button>
                  <button type="button" className="is-primary" onClick={onApprove} disabled={busy}>
                    {state === 'submitting' ? 'Подключаем…' : 'Разрешить подключение'}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </article>
  );
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
