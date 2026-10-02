/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { SubscriptionStatus } from '../../subscriptions/public';
import {
  logoutCurrentAuthSession,
  updateCurrentAuthProfile,
} from '../api/privateAccountApi';
import {
  confirmPasswordReset,
  registerPasswordAccount,
  requestPasswordLogin,
  requestPasswordReset,
  verifyEmailAuthCode,
} from '../api/guestAuthApi';
import {
  authUserFromSuccessPayload,
  type AuthUser,
} from '../model/authUser';
import { canAccessAdminWorkspace } from '../model/authAccess';
import { publicProfilePath } from '../model/publicProfilePath';
import { useTelegramAuthConfig } from '../hooks/useTelegramAuthConfig';
import './IdentityProfile.css';
import AccountDashboard from './AccountDashboard';
import LoginCard from './LoginCard';
import { isRealAuthEmail } from '../model/accountDashboard';
import { continueToCoverAfterLogin, coverSsoReturnTo } from '../../coverAdminSso/public';
const SocialLoginLinks = React.lazy(() => import('./SocialLoginLinks'));

type AdminMessage = { type: 'ok' | 'err'; text: string };

type ContestHistoryItem = {
  id: string;
  contestId: string;
  title: string;
  prize: string;
  imageUrl: string;
  status: string;
  entryStatus: string;
  joinedAt: string;
  startsAt: string;
  endsAt: string;
  isWinner: boolean;
};

type TelegramAuthPayload = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

declare global {
  interface Window {
    onHsArenaTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

const LEGACY_AUTH_TOKEN_KEY = 'hs_arena_auth_token';
const AUTH_EMAIL_KEY = 'hs_arena_auth_email';
const COOKIE_SESSION_MARKER = 'hs_arena_auth_cookie_hint';

function authUrlWithReturnTo(rawUrl: string, returnTo: string): string {
  try {
    const url = new URL(rawUrl || '/api/auth/telegram/start', window.location.origin);
    url.searchParams.set('returnTo', returnTo);
    return url.toString();
  } catch {
    return rawUrl || '/api/auth/telegram/start';
  }
}

function TelegramLoginWidget({
  botUsername,
  authUrl,
  label = 'Войти через Telegram',
}: {
  botUsername: string;
  authUrl: string;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !botUsername || !authUrl) return;
    container.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-auth-url', authUrl);
    script.setAttribute('data-request-access', 'write');
    container.appendChild(script);
    return () => { container.innerHTML = ''; };
  }, [authUrl, botUsername]);

  return (
    <div
      aria-label={label}
      ref={containerRef}
      style={{
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    />
  );
}

function formatSubscriptionDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function markAuthSessionHint(): void {
  try {
    localStorage.setItem(COOKIE_SESSION_MARKER, '1');
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch { /* storage may be disabled */ }
}

function clearAuthSessionHint(): void {
  try {
    localStorage.removeItem(COOKIE_SESSION_MARKER);
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch { /* storage may be disabled */ }
}

const COUNTRY_OPTIONS = [
  'Россия',
  'Беларусь',
  'Казахстан',
  'Украина',
  'Польша',
  'Германия',
  'США',
  'Другая страна',
];


function AuthCheckingCard({ delayMs = 180 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  // Inline on purpose: this card renders before the route stylesheet loads.
  return (
    <div style={{
      minHeight: 220,
      padding: '18px 0',
      opacity: visible ? 1 : 0,
      transition: 'opacity 180ms ease',
    }}>
      <div style={{
        maxWidth: 440,
        margin: '0 auto',
        borderRadius: 16,
        border: '2px solid #6b4a2a',
        background: '#fbf3dc',
        boxShadow: '0 0 0 5px #e3cb94, 0 20px 44px rgba(58,36,18,0.28)',
        padding: '28px 24px',
        textAlign: 'center',
        color: '#3d2a1e',
      }}>
        <div style={{
          width: 56,
          height: 56,
          margin: '0 auto 14px',
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          background: '#7a1e22',
          color: '#f1c76e',
        }}>
          <RefreshCw size={28} className="animate-spin" aria-hidden="true" />
        </div>
        <strong style={{ display: 'block', fontFamily: 'var(--font-hs)', fontSize: '1.25rem' }}>
          Проверяем профиль
        </strong>
        <p style={{ margin: '8px 0 0', color: '#6a513a', fontSize: '0.95rem', lineHeight: 1.45 }}>
          Подключаем сессию Экосистемы Манакоста.
        </p>
      </div>
    </div>
  );
}

let loginPresentationStyles: Promise<unknown> | null = null;

function loadLoginPresentationStyles() {
  loginPresentationStyles ??= import('./LoginPanel.css').catch(error => {
    loginPresentationStyles = null;
    throw error;
  });
  return loginPresentationStyles;
}

export function LoginPanel({
  onAuthChange,
  initialAuthUser = null,
  parentAuthChecking = false,
}: {
  onAuthChange?: (user: AuthUser | null) => void;
  initialAuthUser?: AuthUser | null;
  parentAuthChecking?: boolean;
}) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => initialAuthUser);
  const authChecking = parentAuthChecking;
  const [loginStylesReady, setLoginStylesReady] = useState(false);
  const [authStep, setAuthStep] = useState<'password' | 'code'>('password');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState(() => sessionStorage.getItem(AUTH_EMAIL_KEY) || '');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<AdminMessage | null>(null);
  const {
    authUrl: telegramAuthUrl,
    callbackUrl: telegramCallbackUrl,
    botUsername: telegramBotUsername,
    mode: telegramMode,
    enabled: telegramEnabled,
    socialProviders: socialLoginProviders,
  } = useTelegramAuthConfig();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [boostyEmail, setBoostyEmail] = useState(() => (
    initialAuthUser && isRealAuthEmail(initialAuthUser.email) ? initialAuthUser.email : ''
  ));
  const [boostyCode, setBoostyCode] = useState('');
  const [boostyStep, setBoostyStep] = useState<'email' | 'code'>('email');
  const [profileCountry, setProfileCountry] = useState(() => initialAuthUser?.country || '');
  const [profileNewsletter, setProfileNewsletter] = useState(() => Boolean(initialAuthUser?.newsletterOptIn));
  const [profileVkUrl, setProfileVkUrl] = useState(() => initialAuthUser?.contactVkUrl || '');
  const [profileTelegram, setProfileTelegram] = useState(() => (
    initialAuthUser?.contactTelegram || initialAuthUser?.telegramUsername || ''
  ));
  const [profileContactEmail, setProfileContactEmail] = useState(() => (
    initialAuthUser?.contactEmail
    || (initialAuthUser && isRealAuthEmail(initialAuthUser.email) ? initialAuthUser.email : '')
  ));
  const [contestHistory, setContestHistory] = useState<ContestHistoryItem[]>([]);
  const [contestHistoryLoading, setContestHistoryLoading] = useState(false);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const authHeaders = useCallback((extra: Record<string, string> = {}) => ({
    ...extra,
    'X-CSRF-Request': '1',
  }), []);
  useEffect(() => {
    if (authUser) return;
    let active = true;
    void loadLoginPresentationStyles().then(
      () => { if (active) setLoginStylesReady(true); },
      () => { if (active) setLoginStylesReady(true); },
    );
    return () => { active = false; };
  }, [authUser]);

  const fetchSubscription = useCallback(async (force = false) => {
    setSubscriptionLoading(true);
    try {
      const res = await fetch(force ? '/api/subscription/refresh' : '/api/subscription/status', {
        method: force ? 'POST' : 'GET',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось проверить подписку');
      setSubscription(data);
      return data as SubscriptionStatus;
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
      return null;
    } finally {
      setSubscriptionChecked(true);
      setSubscriptionLoading(false);
    }
  }, [authHeaders]);

  const fetchContestHistory = useCallback(async () => {
    setContestHistoryLoading(true);
    try {
      const res = await fetch('/api/profile/contest-history', {
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить историю конкурсов');
      setContestHistory(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setContestHistory([]);
    } finally {
      setContestHistoryLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!authUser) return;
    void fetchSubscription(false);
    void fetchContestHistory();
  }, [authUser, fetchSubscription, fetchContestHistory]);

  const applyAuthenticatedUser = (user: AuthUser) => {
    setAuthUser(user);
    setBoostyEmail(isRealAuthEmail(user.email) ? user.email : '');
    setProfileCountry(user.country || '');
    setProfileNewsletter(Boolean(user.newsletterOptIn));
    setProfileVkUrl(user.contactVkUrl || '');
    setProfileTelegram(user.contactTelegram || user.telegramUsername || '');
    setProfileContactEmail(user.contactEmail || (isRealAuthEmail(user.email) ? user.email : ''));
    onAuthChange?.(user);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const result = await requestPasswordLogin({ email, password });
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      if (result.kind === 'authenticated') {
        markAuthSessionHint();
        applyAuthenticatedUser(result.user);
        setPassword('');
        setMsg(null);
        continueToCoverAfterLogin();
        return;
      }
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Код отправлен на почту.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await registerPasswordAccount({
        email,
        name,
        country,
        newsletterOptIn,
        password,
      });
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Аккаунт создан. Код отправлен на почту.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const result = await requestPasswordReset({ email });
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: result.message || 'Код отправлен на почту.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await confirmPasswordReset({ email, code, password });
      setAuthMode('login');
      setAuthStep('password');
      setCode('');
      setPassword('');
      setMsg({ type: 'ok', text: 'Пароль обновлен. Теперь можно войти.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const user = await verifyEmailAuthCode({ email, code });
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      markAuthSessionHint();
      applyAuthenticatedUser(user);
      setCode('');
      continueToCoverAfterLogin();
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBoostyEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscriptionLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/subscription/email/request', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: boostyEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить код');
      setBoostyStep('code');
      setMsg({ type: 'ok', text: 'Код отправлен на почту Boosty.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleBoostyEmailConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscriptionLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/subscription/email/confirm', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: boostyEmail, code: boostyCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось подтвердить почту');
      const user = authUserFromSuccessPayload(data);
      if (!user) throw new Error('Не удалось подтвердить почту');
      applyAuthenticatedUser(user);
      setSubscription(data.subscription);
      setSubscriptionChecked(true);
      setBoostyCode('');
      setBoostyStep('email');
      setMsg({ type: 'ok', text: 'Почта привязана, подписка обновлена.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const user = await updateCurrentAuthProfile({
        country: profileCountry,
        newsletterOptIn: profileNewsletter,
        contactVkUrl: profileVkUrl,
        contactTelegram: profileTelegram,
        contactEmail: profileContactEmail,
      });
      setAuthUser(user);
      setProfileVkUrl(user.contactVkUrl || '');
      setProfileTelegram(user.contactTelegram || user.telegramUsername || '');
      setProfileContactEmail(user.contactEmail || (isRealAuthEmail(user.email) ? user.email : ''));
      onAuthChange?.(user);
      setMsg({ type: 'ok', text: 'Профиль обновлен.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    void logoutCurrentAuthSession().catch(() => {});
    clearAuthSessionHint();
    setAuthUser(null);
    setSubscription(null);
    setSubscriptionChecked(false);
    setContestHistory([]);
    onAuthChange?.(null);
    setAuthStep('password');
    setPassword('');
    setCode('');
    setMsg(null);
  };

  const telegramLoginUrl = authUrlWithReturnTo(telegramMode === 'legacy-widget' ? telegramCallbackUrl : telegramAuthUrl, coverSsoReturnTo() || '/?login&telegram=ok');
  const patreonLinkUrl = authUrlWithReturnTo('/api/auth/patreon/start', '/?login&patreon=linked');

  if (authChecking && !authUser) {
    return <AuthCheckingCard />;
  }

  if (!authUser && !loginStylesReady) {
    return <AuthCheckingCard delayMs={0} />;
  }

  if (authUser) {
    const profileName = authUser.name?.trim() === 'Пользователь Манакост'
      ? 'Пользователь Манакоста'
      : (authUser.name?.trim() || 'Пользователь Манакоста');
    const profileContact = authUser.contactEmail
      || (isRealAuthEmail(authUser.email) ? authUser.email : '')
      || (authUser.contactTelegram || authUser.telegramUsername ? `@${authUser.contactTelegram || authUser.telegramUsername}` : '')
      || authUser.email;
    const publicProfileHref = authUser.publicProfileId
      ? publicProfilePath(authUser.publicProfileId)
      : '';
    const copyPublicProfileLink = async () => {
      if (!publicProfileHref) return;
      await navigator.clipboard.writeText(new URL(publicProfileHref, window.location.origin).href);
      setPublicLinkCopied(true);
      window.setTimeout(() => setPublicLinkCopied(false), 2_000);
    };
    return (
      <AccountDashboard
        user={authUser}
        name={profileName}
        contact={profileContact}
        publicProfileHref={publicProfileHref}
        linkCopied={publicLinkCopied}
        onCopyLink={() => { void copyPublicProfileLink(); }}
        message={msg}
        subscription={subscription}
        subscriptionLoading={subscriptionLoading}
        subscriptionChecked={subscriptionChecked}
        checkedAt={formatSubscriptionDate(subscription?.checkedAt ?? null)}
        onRefreshSubscription={() => { void fetchSubscription(true); }}
        boosty={{
          email: boostyEmail,
          code: boostyCode,
          step: boostyStep,
          busy: subscriptionLoading,
          onEmailChange: setBoostyEmail,
          onCodeChange: setBoostyCode,
          onSubmit: boostyStep === 'email' ? handleBoostyEmailRequest : handleBoostyEmailConfirm,
        }}
        patreonLinkUrl={patreonLinkUrl}
        telegram={{
          userId: authUser.id || authUser.profileId || '',
          mode: telegramMode,
          botUsername: telegramBotUsername,
          onMessage: (type, text) => setMsg({ type, text }),
        }}
        contests={{ entries: contestHistory, loading: contestHistoryLoading }}
        settings={{
          values: {
            country: profileCountry,
            telegram: profileTelegram,
            vkUrl: profileVkUrl,
            contactEmail: profileContactEmail,
            newsletter: profileNewsletter,
          },
          countries: COUNTRY_OPTIONS,
          saving: loading,
          onChange: patch => {
            if (patch.country !== undefined) setProfileCountry(patch.country);
            if (patch.telegram !== undefined) setProfileTelegram(patch.telegram);
            if (patch.vkUrl !== undefined) setProfileVkUrl(patch.vkUrl);
            if (patch.contactEmail !== undefined) setProfileContactEmail(patch.contactEmail);
            if (patch.newsletter !== undefined) setProfileNewsletter(patch.newsletter);
          },
          onSubmit: handleProfileSave,
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <LoginCard
      mode={authMode}
      step={authStep}
      message={msg}
      loading={loading}
      values={{ name, country, email, password, code, newsletter: newsletterOptIn }}
      countries={COUNTRY_OPTIONS}
      onChange={patch => {
        if (patch.name !== undefined) setName(patch.name);
        if (patch.country !== undefined) setCountry(patch.country);
        if (patch.email !== undefined) setEmail(patch.email);
        if (patch.password !== undefined) setPassword(patch.password);
        if (patch.code !== undefined) setCode(patch.code);
        if (patch.newsletter !== undefined) setNewsletterOptIn(patch.newsletter);
      }}
      onModeChange={mode => { setAuthMode(mode); setMsg(null); setAuthStep('password'); }}
      onSubmit={authStep === 'password'
        ? (authMode === 'login' ? handleLogin : authMode === 'register' ? handleRegister : handleResetRequest)
        : (authMode === 'reset' ? handleResetConfirm : handleVerify)}
      onEditCredentials={() => { setAuthStep('password'); setCode(''); setMsg(null); }}
      providers={(
        <>
          {telegramEnabled && telegramMode === 'legacy-widget' && telegramBotUsername && (
            <div className="login-telegram">
              <div className="login-divider" aria-hidden="true">
                <span className="login-divider__line" />
                <span>или</span>
                <span className="login-divider__line" />
              </div>
              <TelegramLoginWidget botUsername={telegramBotUsername} authUrl={telegramLoginUrl} label="Войти через Telegram" />
            </div>
          )}
          <React.Suspense fallback={null}>
            <SocialLoginLinks
              disabled={loading}
              providers={socialLoginProviders}
              telegramAuthUrl={telegramEnabled && telegramMode !== 'legacy-widget' ? telegramLoginUrl || '/api/auth/telegram/start' : ''}
              withDivider={!(telegramEnabled && telegramMode === 'legacy-widget' && telegramBotUsername)}
            />
          </React.Suspense>
        </>
      )}
    />
  );
}

// ─── InternalLinks ────────────────────────────────────────────────────────────
