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
import type { AuthUser } from '../model/authUser';
import { publicProfilePath } from '../model/publicProfilePath';
import './IdentityProfile.css';
import ProfileIdentityHero from '../../../components/ProfileIdentityHero';

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

type TelegramAuthMode = 'legacy-widget' | 'oidc' | 'disabled';

declare global {
  interface Window {
    onHsArenaTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

const LEGACY_AUTH_TOKEN_KEY = 'hs_arena_auth_token';
const AUTH_EMAIL_KEY = 'hs_arena_auth_email';
const AUTH_SESSION_HINT_KEY = 'hs_arena_auth_cookie_hint';

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
    localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch { /* storage may be disabled */ }
}

function clearAuthSessionHint(): void {
  try {
    localStorage.removeItem(AUTH_SESSION_HINT_KEY);
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
  const [authChecking, setAuthChecking] = useState(parentAuthChecking);
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
  const [telegramAuthUrl, setTelegramAuthUrl] = useState('');
  const [telegramCallbackUrl, setTelegramCallbackUrl] = useState('');
  const [telegramBotUsername, setTelegramBotUsername] = useState('');
  const [telegramMode, setTelegramMode] = useState<TelegramAuthMode>('disabled');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramLinkCode, setTelegramLinkCode] = useState('');
  const [telegramLinkExpiresAt, setTelegramLinkExpiresAt] = useState('');
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [boostyEmail, setBoostyEmail] = useState('');
  const [boostyCode, setBoostyCode] = useState('');
  const [boostyStep, setBoostyStep] = useState<'email' | 'code'>('email');
  const [profileCountry, setProfileCountry] = useState('');
  const [profileNewsletter, setProfileNewsletter] = useState(false);
  const [profileVkUrl, setProfileVkUrl] = useState('');
  const [profileTelegram, setProfileTelegram] = useState('');
  const [profileContactEmail, setProfileContactEmail] = useState('');
  const [contestHistory, setContestHistory] = useState<ContestHistoryItem[]>([]);
  const [contestHistoryLoading, setContestHistoryLoading] = useState(false);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);

  const authHeaders = useCallback((extra: Record<string, string> = {}) => ({
    ...extra,
    'X-CSRF-Request': '1',
  }), []);

  useEffect(() => {
    fetch('/api/auth/telegram/config')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.enabled || !data.authUrl) return;
        setTelegramAuthUrl(String(data.authUrl || '/api/auth/telegram/start'));
        setTelegramCallbackUrl(String(data.callbackUrl || data.authUrl || '/api/auth/telegram/callback'));
        setTelegramBotUsername(String(data.botUsername || ''));
        setTelegramMode(data.mode === 'legacy-widget' ? 'legacy-widget' : data.mode === 'oidc' ? 'oidc' : 'disabled');
        setTelegramEnabled(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authUser) return;
    let active = true;
    void loadLoginPresentationStyles().then(
      () => { if (active) setLoginStylesReady(true); },
      () => { if (active) setLoginStylesReady(true); },
    );
    return () => { active = false; };
  }, [authUser]);

  useEffect(() => {
    if (parentAuthChecking) {
      setAuthChecking(true);
      return;
    }

    setAuthChecking(false);
    setAuthUser(initialAuthUser);
    if (initialAuthUser) {
      setBoostyEmail(isRealAuthEmail(initialAuthUser.email) ? initialAuthUser.email : '');
      setProfileCountry(initialAuthUser.country || '');
      setProfileNewsletter(Boolean(initialAuthUser.newsletterOptIn));
      setProfileVkUrl(initialAuthUser.contactVkUrl || '');
      setProfileTelegram(initialAuthUser.contactTelegram || initialAuthUser.telegramUsername || '');
      setProfileContactEmail(initialAuthUser.contactEmail || (isRealAuthEmail(initialAuthUser.email) ? initialAuthUser.email : ''));
      setTelegramLinkCode('');
      setTelegramLinkExpiresAt('');
      return;
    }

    setAuthStep('password');
  }, [initialAuthUser, parentAuthChecking]);

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
    } catch (err: any) {
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
    if (!authUser) {
      setSubscription(null);
      setSubscriptionChecked(false);
      setContestHistory([]);
      return;
    }
    setSubscriptionChecked(false);
    void fetchSubscription(false);
    void fetchContestHistory();
  }, [authUser, fetchSubscription, fetchContestHistory]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      if (data.user) {
        markAuthSessionHint();
        setAuthUser(data.user);
        setProfileCountry(data.user?.country || '');
        setProfileNewsletter(Boolean(data.user?.newsletterOptIn));
        setProfileVkUrl(data.user?.contactVkUrl || '');
        setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
        setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
        onAuthChange?.(data.user);
        setPassword('');
        setMsg(null);
        return;
      }
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Код отправлен на почту.' });
    } catch (err: any) {
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, country, newsletterOptIn, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Аккаунт создан. Код отправлен на почту.' });
    } catch (err: any) {
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
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить код');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: data.message || 'Код отправлен на почту.' });
    } catch (err: any) {
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
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить пароль');
      setAuthMode('login');
      setAuthStep('password');
      setCode('');
      setPassword('');
      setMsg({ type: 'ok', text: 'Пароль обновлен. Теперь можно войти.' });
    } catch (err: any) {
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
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Неверный код');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      markAuthSessionHint();
      setAuthUser(data.user);
      setProfileCountry(data.user?.country || '');
      setProfileNewsletter(Boolean(data.user?.newsletterOptIn));
      setProfileVkUrl(data.user?.contactVkUrl || '');
      setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
      setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
      onAuthChange?.(data.user);
      setCode('');
    } catch (err: any) {
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
    } catch (err: any) {
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
      setAuthUser(data.user);
      setProfileCountry(data.user?.country || '');
      setProfileNewsletter(Boolean(data.user?.newsletterOptIn));
      setProfileVkUrl(data.user?.contactVkUrl || '');
      setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
      setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
      onAuthChange?.(data.user);
      setSubscription(data.subscription);
      setSubscriptionChecked(true);
      setBoostyCode('');
      setBoostyStep('email');
      setMsg({ type: 'ok', text: 'Почта привязана, подписка обновлена.' });
    } catch (err: any) {
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
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          country: profileCountry,
          newsletterOptIn: profileNewsletter,
          contactVkUrl: profileVkUrl,
          contactTelegram: profileTelegram,
          contactEmail: profileContactEmail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить профиль');
      setAuthUser(data.user);
      setProfileVkUrl(data.user?.contactVkUrl || '');
      setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
      setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
      onAuthChange?.(data.user);
      setMsg({ type: 'ok', text: 'Профиль обновлен.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    }).catch(() => {});
    clearAuthSessionHint();
    setAuthUser(null);
    setSubscription(null);
    setSubscriptionChecked(false);
    setContestHistory([]);
    setTelegramLinkCode('');
    setTelegramLinkExpiresAt('');
    onAuthChange?.(null);
    setAuthStep('password');
    setPassword('');
    setCode('');
    setMsg(null);
    setAuthChecking(false);
  };

  const telegramLoginUrl = authUrlWithReturnTo(
    telegramMode === 'legacy-widget' ? telegramCallbackUrl : telegramAuthUrl,
    '/?login&telegram=ok',
  );
  const telegramLinkUrl = authUrlWithReturnTo(
    telegramMode === 'legacy-widget' ? telegramCallbackUrl : telegramAuthUrl,
    '/?login&telegram=linked',
  );

  const handleTelegramLinkCodeRequest = async () => {
    setTelegramLinkLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/telegram/link-code', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось создать Telegram ID-код');
      setTelegramLinkCode(String(data.code || ''));
      setTelegramLinkExpiresAt(String(data.expiresAt || ''));
      if (data.botUsername) setTelegramBotUsername(String(data.botUsername));
      setMsg({ type: 'ok', text: 'ID-код создан. Отправьте его Telegram-боту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setTelegramLinkLoading(false);
    }
  };

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
    const identityLabel = authUser.telegramUsername
      ? 'Telegram привязан'
      : isRealAuthEmail(authUser.email)
        ? 'Email привязан'
        : 'Профиль без email';
    const telegramLinkBotUrl = telegramBotUsername && telegramLinkCode
      ? `https://t.me/${telegramBotUsername}?start=${encodeURIComponent(telegramLinkCode)}`
      : '';
    const telegramLinkExpiresLabel = telegramLinkExpiresAt ? formatSubscriptionDate(telegramLinkExpiresAt) : '';
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
          <section className="profile-contact-section">
            <form
              className="profile-settings-form"
              onSubmit={handleProfileSave}
            >
              <div className="profile-section-heading" data-tour-id="profile-contacts">
                <strong>Настройки и каналы связи</strong>
                <span>
                  Укажите удобные контакты. Они будут использоваться для конкурсов, призов и важных уведомлений.
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
          <section className={`profile-subscription-panel ${subscription?.hasAccess ? 'profile-subscription-panel--active' : ''}`}>
            <div className="profile-subscription-header" data-tour-id="profile-access-status">
              <div>
                <p className="profile-subscription-kicker">
                  Доступ к закрытым разделам
                </p>
                <strong className="profile-subscription-state">
                  {subscriptionPending
                    ? 'Проверяем...'
                    : subscription?.hasAccess
                      ? 'Активна'
                      : 'Не подтверждена'}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => { void fetchSubscription(true); }}
                disabled={subscriptionLoading}
              >
                {subscriptionLoading ? 'Проверяем...' : 'Обновить'}
              </button>
            </div>
            <p className="profile-subscription-copy">
              {subscription?.message || 'Подтвердите подписку через Boosty или Telegram VIP-канал.'}
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
            <div className="profile-subscription-sources">
              <div className="profile-subscription-source">
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
              <div className="profile-subscription-source profile-subscription-source--telegram" data-tour-id="profile-telegram-access">
                <img src="/ad/telegram.png" alt="" />
                <div>
                <strong>Telegram</strong>
                <p>
                  {subscription?.telegram?.hasAccess
                    ? 'Найден в VIP-канале'
                    : subscription?.telegram?.message || 'Войдите через Telegram для проверки каналов.'}
                </p>
                <div className="profile-subscription-source__actions">
                  <button
                    type="button"
                    onClick={() => { void handleTelegramLinkCodeRequest(); }}
                    disabled={telegramLinkLoading || !telegramBotUsername}
                  >
                    {telegramLinkLoading ? 'Создаем...' : 'ID-код для бота'}
                  </button>
                  {telegramLinkCode && (
                    <code>
                      {telegramLinkCode}
                    </code>
                  )}
                  {telegramLinkBotUrl && (
                    <a
                      href={telegramLinkBotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="profile-subscription-source__link"
                    >
                      Открыть @{telegramBotUsername}
                    </a>
                  )}
                  {telegramLinkExpiresLabel && (
                    <span className="profile-subscription-source__expiry">до {telegramLinkExpiresLabel}</span>
                  )}
                </div>
                <p className="profile-subscription-source__tip">
                  Для Boosty-почты в боте: /email name@example.com.
                </p>
                </div>
              </div>
            </div>
            <p className="profile-subscription-checked">
              Последняя проверка: {formatSubscriptionDate(subscription?.checkedAt ?? null)}
            </p>
            <form
              className="profile-boosty-form"
              data-tour-id="profile-boosty-access"
              onSubmit={boostyStep === 'email' ? handleBoostyEmailRequest : handleBoostyEmailConfirm}
            >
              <p>
                Для Boosty подтвердите почту, которая указана в вашем Boosty-профиле. Это отдельная проверка от Telegram.
              </p>
              <input
                type="email"
                value={boostyEmail}
                onChange={e => setBoostyEmail(e.target.value)}
                placeholder="Email из Boosty"
              />
              {boostyStep === 'code' && (
                <input
                  type="text"
                  inputMode="numeric"
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
            {telegramEnabled && !authUser.telegramUsername && (
              <div className="profile-telegram-link">
                <p>
                  Для Telegram-подписки нужно привязать сам Telegram-аккаунт. Поле @username в контактах не подходит для проверки VIP-канала.
                </p>
                {telegramMode === 'legacy-widget' && telegramBotUsername ? (
                  <TelegramLoginWidget
                    botUsername={telegramBotUsername}
                    authUrl={telegramLinkUrl}
                    label="Привязать Telegram"
                  />
                ) : (
                  <a href={telegramLinkUrl}>
                    Привязать Telegram
                  </a>
                )}
              </div>
            )}
          </section>
          <section className="profile-contests">
            <div className="profile-contests__heading" data-tour-id="profile-contests">
              <div>
                <strong>История участия в конкурсах</strong>
                <span>
                  Здесь отображаются конкурсы, куда вы подали заявку через профиль Манакоста.
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
                Вы пока не участвовали в конкурсах. Когда нажмете “Участвовать” на странице конкурса, заявка появится здесь.
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
            {(authUser.adminAllowed || authUser.role === 'admin') && (
              <>
                <a href="/standard/meta" data-profile-admin-destination="standard-meta">
                  Открыть мету Standard · Beta
                </a>
                <a href={'/?admin&section=list'} data-profile-admin-destination="articles">
                  Настроить статьи
                </a>
              </>
            )}
            <button type="button" onClick={handleLogout}>
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
        {authStep === 'password' && authMode === 'login' && telegramEnabled && (
          <div className="login-telegram">
            <div className="login-divider">
              <span className="login-divider__line" />
              <span>или</span>
              <span className="login-divider__line" />
            </div>
            {telegramMode === 'legacy-widget' && telegramBotUsername ? (
              <TelegramLoginWidget
                botUsername={telegramBotUsername}
                authUrl={telegramLoginUrl}
                label="Войти через Telegram"
              />
            ) : (
              <a
                href={telegramLoginUrl || '/api/auth/telegram/start'}
                className={`login-telegram-link${loading ? ' login-telegram-link--disabled' : ''}`}
                aria-disabled={loading}
              >
                <span className="login-telegram-link__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
                    <path fill="#ffffff" d="M21.7 3.3c.3-.9-.6-1.6-1.4-1.2L2.9 8.8c-1 .4-.9 1.8.1 2.1l4.4 1.4 1.7 5.3c.3.9 1.5 1.1 2.1.4l2.4-2.8 4.6 3.4c.8.6 1.9.1 2.1-.9l2.9-14.4ZM8.1 11.8l9.5-5.9-7.4 7.7-.3 3.2-1.8-5Z" />
                  </svg>
                </span>
                <span>Войти через Telegram</span>
              </a>
            )}
          </div>
        )}
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
