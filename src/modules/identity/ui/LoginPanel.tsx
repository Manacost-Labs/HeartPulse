/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  LogIn,
  RefreshCw,
  Star,
  Trophy,
  UserCircle,
} from 'lucide-react';
import {
  subscriptionEntitlementLabels,
  type SubscriptionStatus,
} from '../../subscriptions/public';
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
import ProfileIdentityHero from './ProfileIdentityHero';
import ProfileAccessSummary from './ProfileAccessSummary';
import { continueToCoverAfterLogin, coverSsoReturnTo } from '../../coverAdminSso/public';
const SocialLoginLinks = React.lazy(() => import('./SocialLoginLinks'));

const TelegramAccountLinkActions = React.lazy(() => import('./TelegramAccountLinkActions'));

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

function isRealAuthEmail(email?: string): boolean {
  return Boolean(email && email.includes('@') && !email.endsWith('@telegram.local') && !email.endsWith('.local'));
}

function formatSubscriptionDate(value: string | null): string {
  if (!value) return 'Еще не проверяли';
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

const PROFILE_CONTEST_STATUS_TEXT: Record<string, string> = {
  active: 'Идет',
  planned: 'Скоро',
  completed: 'Завершен',
  cancelled: 'Отменен',
  draft: 'Черновик',
};

function PasswordInput({
  value,
  onChange,
  placeholder = 'Пароль',
  autoComplete = 'current-password',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: 'current-password' | 'new-password';
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="login-field login-password-field">
      <span>{placeholder}</span>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        title={visible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </label>
  );
}

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

  return (
    <div style={{
      minHeight: 220,
      padding: '18px 0',
      opacity: visible ? 1 : 0,
      transition: 'opacity 180ms ease',
    }}>
      <div style={{
        maxWidth: 460,
        margin: '0 auto',
        borderRadius: '16px',
        border: '1px solid rgba(148,163,184,0.42)',
        background: 'linear-gradient(180deg, rgba(248,250,255,0.98), rgba(235,241,252,0.94))',
        boxShadow: '0 24px 54px rgba(4,10,20,0.24), inset 0 1px 0 rgba(255,255,255,0.75)',
        padding: '28px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 58,
          height: 58,
          margin: '0 auto 14px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg,#12233f,#081020)',
          color: '#93c5fd',
          border: '2px solid rgba(56,189,248,0.45)',
          boxShadow: '0 12px 26px rgba(15,23,42,0.22)',
        }}>
          <RefreshCw size={28} className="animate-spin" />
        </div>
        <strong style={{ display: 'block', color: '#1e293b', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
          Проверяем профиль
        </strong>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '13px', lineHeight: 1.45 }}>
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
    const subscriptionPending = subscriptionLoading || !subscriptionChecked;
    const profileRoleLabel = authUser.role === 'admin'
      ? 'Администратор'
      : subscription?.hasAccess
        ? 'Платный подписчик'
        : 'Участник';
    const subscriptionLabel = subscriptionPending
      ? 'Проверяем подписку'
      : subscription?.hasAccess
        ? 'Подписка активна'
        : 'Подписка не подтверждена';
    const subscriptionAccessLabels = subscriptionEntitlementLabels(subscription);
    const identityLabel = authUser.telegramLinked
      ? 'Telegram привязан'
      : isRealAuthEmail(authUser.email)
        ? 'Email привязан'
        : 'Профиль без email';
    const wonContestCount = contestHistory.filter(item => item.isWinner).length;
    const profileId = authUser.publicProfileId || '—';
    const profileIdDisplay = profileId;
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
      <div className="profile-page profile-workspace">
        <div className="profile-card">
          <ProfileIdentityHero
            eyebrow="Личный кабинет"
            name={profileName}
            publicProfileId={profileIdDisplay}
            avatarInitials={authUser.avatarInitials}
            photoUrl={authUser.photoUrl}
            contact={profileContact}
            tourId="profile-summary"
            actions={publicProfileHref ? (
              <div className="profile-public-link">
                <a href={publicProfileHref}>
                  Публичный профиль
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
                <button type="button" onClick={() => { void copyPublicProfileLink(); }}>
                  <Copy size={14} aria-hidden="true" />
                  {publicLinkCopied ? 'Скопировано' : 'Скопировать ссылку'}
                </button>
              </div>
            ) : undefined}
            badges={[
              { label: profileRoleLabel, icon: <UserCircle size={14} aria-hidden="true" /> },
              { label: subscriptionLabel, icon: <Star size={14} aria-hidden="true" /> },
              { label: identityLabel, icon: <LogIn size={14} aria-hidden="true" /> },
            ]}
          />
          {msg && (
            <div className={`profile-message profile-message--${msg.type}`} role={msg.type === 'err' ? 'alert' : 'status'} aria-live="polite">
              {msg.text}
            </div>
          )}
          <section className={`profile-subscription-panel ${subscription?.hasAccess ? 'profile-subscription-panel--active' : ''}`}>
            <ProfileAccessSummary
              pending={subscriptionPending}
              active={Boolean(subscription?.hasAccess)}
              checkedAt={formatSubscriptionDate(subscription?.checkedAt ?? null)}
              onRefresh={() => { void fetchSubscription(true); }}
            />
            <p className="profile-subscription-copy">
              {subscription?.message || 'Подтвердите подписку через Boosty, Patreon или Telegram VIP-канал.'}
            </p>
            {subscriptionAccessLabels.length > 0 && (
              <div className="profile-access-list">
                {subscriptionAccessLabels.map(label => (
                  <span key={label} className="profile-access-item">
                    {label}
                  </span>
                ))}
              </div>
            )}
            <details className="profile-subscription-management" open={subscriptionChecked && !subscription?.hasAccess}>
              <summary>Настроить доступ</summary>
              <div className="profile-subscription-sources">
                <div className={`profile-subscription-source ${subscription?.boosty?.hasAccess ? 'profile-subscription-source--active' : ''}`}>
                  <img src="/ad/boosty.png" alt="" />
                  <div>
                  <strong>Boosty</strong>
                  <p>
                    {subscription?.boosty?.hasAccess
                      ? `${subscription.boosty.levelName || 'Уровень'} · ${subscription.boosty.price || 0} RUB`
                      : subscription?.boosty?.message || 'Почта еще не проверена.'}
                  </p>
                  </div>
                </div>
                <div className={`profile-subscription-source profile-subscription-source--telegram ${subscription?.telegram?.hasAccess ? 'profile-subscription-source--active' : ''}`} data-tour-id="profile-telegram-access">
                  <img src="/ad/telegram.png" alt="" />
                  <div>
                  <strong>Telegram</strong>
                  <p>
                    {subscription?.telegram?.hasAccess
                      ? 'Найден в VIP-канале'
                      : subscription?.telegram?.message || 'Войдите через Telegram для проверки каналов.'}
                  </p>
                  <React.Suspense fallback={null}>
                    <TelegramAccountLinkActions
                      userId={authUser.id || authUser.profileId || ''}
                      mode={telegramMode}
                      botUsername={telegramBotUsername}
                      onMessage={(type, text) => setMsg({ type, text })}
                    />
                  </React.Suspense>
                  </div>
                </div>
                <div className={`profile-subscription-source profile-subscription-source--patreon ${subscription?.patreon?.hasAccess ? 'profile-subscription-source--active' : ''}`}>
                  <span className="profile-subscription-source__brand profile-subscription-source__brand--patreon" aria-hidden="true">P</span>
                  <div>
                    <strong>Patreon</strong>
                    <p>{subscription?.patreon?.hasAccess ? `${subscription.patreon.tierTitles?.join(' · ') || 'Алмаз'} · полный доступ` : subscription?.patreon?.message || 'Привяжите Patreon для проверки подписки.'}</p>
                    {subscription?.patreon?.configured ? (
                      <div className="profile-subscription-source__actions"><a href={patreonLinkUrl} className="profile-subscription-source__link profile-subscription-source__link--button">{subscription.patreon.connected ? 'Обновить Patreon' : 'Привязать Patreon'}</a></div>
                    ) : null}
                  </div>
                </div>
              </div>
              <form
                className="profile-boosty-form"
                data-tour-id="profile-boosty-access"
                onSubmit={boostyStep === 'email' ? handleBoostyEmailRequest : handleBoostyEmailConfirm}
              >
                <p>
                  Введите почту, на которую оформлена подписка Boosty.
                </p>
                <input
                  type="email"
                  aria-label="Почта подписки Boosty"
                  value={boostyEmail}
                  onChange={e => setBoostyEmail(e.target.value)}
                  placeholder="Email из Boosty"
                />
                {boostyStep === 'code' && (
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Код подтверждения Boosty"
                    value={boostyCode}
                    onChange={e => setBoostyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-значный код"
                    className="profile-boosty-code"
                  />
                )}
                <button type="submit" disabled={subscriptionLoading}>
                  {subscriptionLoading
                    ? 'Проверяем...'
                    : boostyStep === 'email'
                      ? 'Подтвердить Boosty-почту'
                      : 'Подтвердить код Boosty'}
                </button>
              </form>
            </details>
          </section>
          <section className="profile-contact-section">
            <form
              className="profile-settings-form"
              onSubmit={handleProfileSave}
            >
              <div className="profile-section-heading" data-tour-id="profile-contacts">
                <h2>Контакты и настройки</h2>
                <span>
                  Для связи по конкурсам, призам и важным уведомлениям.
                </span>
              </div>
              <label>
                Страна
                <select value={profileCountry} onChange={e => setProfileCountry(e.target.value)}>
                  <option value="">Не указана</option>
                  {COUNTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Telegram
                <input value={profileTelegram} onChange={e => setProfileTelegram(e.target.value)} placeholder="@username" />
              </label>
              <label>
                VK
                <input value={profileVkUrl} onChange={e => setProfileVkUrl(e.target.value)} placeholder="https://vk.com/username" />
              </label>
              <label>
                Почта для связи
                <input type="email" value={profileContactEmail} onChange={e => setProfileContactEmail(e.target.value)} placeholder="mail@example.com" />
              </label>
              <label className="profile-checkbox-row">
                <input
                  className="profile-checkbox"
                  type="checkbox"
                  checked={profileNewsletter}
                  onChange={e => setProfileNewsletter(e.target.checked)}
                />
                <span>Получать рассылку Манакоста</span>
              </label>
              <button type="submit" disabled={loading}>
                Сохранить профиль
              </button>
            </form>
          </section>
          <section className="profile-contests">
            <div className="profile-contests__heading" data-tour-id="profile-contests">
              <div>
                <h2>Ваши конкурсы</h2>
                <span>
                  Заявки, результаты и призы в одном месте.
                </span>
              </div>
              <span className="profile-contests__count">
                <Trophy size={14} />
                {contestHistory.length} участий · {wonContestCount} побед
              </span>
            </div>
            {contestHistoryLoading ? (
              <div className="profile-contests__state">Загружаем историю...</div>
            ) : contestHistory.length === 0 ? (
              <div className="profile-contests__state profile-contests__state--empty">
                Пока нет участий. Выберите конкурс — заявки и результаты появятся здесь.
              </div>
            ) : (
              <div className="profile-contest-list">
                {contestHistory.map(item => (
                  <article key={item.id || item.contestId} className={`profile-contest-entry ${item.imageUrl ? 'profile-contest-entry--with-image' : ''} ${item.isWinner ? 'profile-contest-entry--winner' : ''}`}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
                    )}
                    <div className="profile-contest-entry__body">
                      <div className="profile-contest-entry__badges">
                        <span className={`profile-contest-badge profile-contest-badge--${item.status === 'completed' ? 'completed' : 'active'}`}>
                          {PROFILE_CONTEST_STATUS_TEXT[item.status] || item.status}
                        </span>
                        <span className="profile-contest-badge profile-contest-badge--entry">
                          {item.entryStatus === 'approved' ? 'Участие одобрено' : item.entryStatus || 'Заявка'}
                        </span>
                        {item.isWinner && (
                          <span className="profile-contest-badge profile-contest-badge--winner">
                            Победитель
                          </span>
                        )}
                      </div>
                      <strong className="profile-contest-entry__title">{item.title}</strong>
                      {item.prize && <p className="profile-contest-entry__prize">Приз: {item.prize}</p>}
                      <p className="profile-contest-entry__date">
                        Заявка: {item.joinedAt ? new Date(item.joinedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'дата не указана'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <div className="profile-account-actions" data-tour-id="profile-account-actions">
            <button type="button" className="profile-account-actions__logout" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="login-card-title">
        <div className="login-card__emblem" aria-hidden="true">
          <UserCircle size={30} />
        </div>
        <h2 id="login-card-title" className="login-card__title">
          {authMode === 'register' ? 'Регистрация' : authMode === 'reset' ? 'Восстановление пароля' : 'Войти в экосистему Манакост'}
        </h2>
        <p className="login-card__intro">
          {authMode === 'register'
            ? 'Укажите данные профиля, затем подтвердите почту кодом.'
            : authMode === 'reset'
              ? 'Укажите почту, получите код и задайте новый пароль.'
              : 'Войдите по почте, паролю и коду подтверждения.'}
        </p>
        {msg && (
          <div
            className={`login-message login-message--${msg.type}`}
            role={msg.type === 'err' ? 'alert' : 'status'}
            aria-live={msg.type === 'err' ? 'assertive' : 'polite'}
          >
            {msg.text}
          </div>
        )}
        {authStep === 'password' && (
          <div className="login-mode-tabs" aria-label="Режим авторизации">
            {(['login', 'register'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => { setAuthMode(mode); setMsg(null); setAuthStep('password'); }}
                className={`login-mode-tab${authMode === mode ? ' login-mode-tab-active' : ''}`}
                aria-pressed={authMode === mode}
              >
                {mode === 'login' ? 'Вход' : 'Регистрация'}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={authStep === 'password'
            ? (authMode === 'login' ? handleLogin : authMode === 'register' ? handleRegister : handleResetRequest)
            : (authMode === 'reset' ? handleResetConfirm : handleVerify)}
          className="login-form"
        >
          {authStep === 'password' ? (
            <>
              {authMode === 'register' && (
                <>
                  <label className="login-field">
                    <span>Имя</span>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Имя"
                      autoComplete="name"
                    />
                  </label>
                  <label className="login-field">
                    <span>Страна</span>
                    <select value={country} onChange={e => setCountry(e.target.value)} required>
                      <option value="">Выберите страну</option>
                      {COUNTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                </>
              )}
              <label className="login-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  autoFocus
                />
              </label>
              {authMode !== 'reset' && (
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                />
              )}
              {authMode === 'register' && (
                <label className="login-consent">
                  <input
                    type="checkbox"
                    checked={newsletterOptIn}
                    onChange={e => setNewsletterOptIn(e.target.checked)}
                    required
                  />
                  <span>Подтверждаю согласие получать рассылку HS-Arena с новостями, гайдами и обновлениями.</span>
                </label>
              )}
            </>
          ) : (
            <>
              <p className="login-code-sent">
                Код отправлен на <b>{email}</b>
              </p>
              <label className="login-field login-code-field">
                <span>Код подтверждения</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-значный код"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </label>
              <button
                type="button"
                onClick={() => { setAuthStep('password'); setCode(''); setMsg(null); }}
                className="login-link-button"
              >
                Изменить email или пароль
              </button>
              {authMode === 'reset' && (
                <PasswordInput value={password} onChange={setPassword} placeholder="Новый пароль" autoComplete="new-password" />
              )}
            </>
          )}
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Проверяем...' : authStep === 'password' ? 'Получить код' : authMode === 'reset' ? 'Сменить пароль' : 'Войти'}
          </button>
        </form>
        {authStep === 'password' && authMode === 'login' && telegramEnabled && telegramMode === 'legacy-widget' && (
          <div className="login-telegram">
            <div className="login-divider">
              <span className="login-divider__line" />
              <span>или</span>
              <span className="login-divider__line" />
            </div>
            {telegramBotUsername ? (
              <TelegramLoginWidget
                botUsername={telegramBotUsername}
                authUrl={telegramLoginUrl}
                label="Войти через Telegram"
              />
            ) : null}
          </div>
        )}
        {authStep === 'password' && authMode === 'login' && <React.Suspense fallback={null}><SocialLoginLinks disabled={loading} providers={socialLoginProviders} telegramAuthUrl={telegramEnabled && telegramMode !== 'legacy-widget' ? telegramLoginUrl || '/api/auth/telegram/start' : ''} withDivider={telegramMode !== 'legacy-widget'} /></React.Suspense>}
        {authStep === 'password' && authMode === 'login' && (
          <button
            type="button"
            onClick={() => { setAuthMode('reset'); setMsg(null); }}
            className="login-link-button login-link-button--footer"
          >
            Забыли пароль?
          </button>
        )}
        {authStep === 'password' && authMode === 'reset' && (
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setMsg(null); }}
            className="login-link-button login-link-button--footer"
          >
            Вернуться ко входу
          </button>
        )}
      </section>
    </div>
  );
}

// ─── InternalLinks ────────────────────────────────────────────────────────────
