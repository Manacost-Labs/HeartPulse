import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import {
  authUserFromProfilePayload,
  type AuthProfileUpdate,
} from '../model/authProfile';
import { accountSessionsFromPayload, type AccountSession } from '../model/accountSessions';
import { ownPublicProfileFromPayload, type OwnPublicProfile } from '../model/publicProfile';
import { authErrorFromPayload, type AuthUser } from '../model/authUser';

const AUTH_JSON_HEADERS = {
  'Content-Type': 'application/json',
  'X-CSRF-Request': '1',
};

export async function updateCurrentAuthProfile(update: AuthProfileUpdate): Promise<AuthUser> {
  const response = await fetch('/api/auth/profile', {
    method: 'PATCH',
    headers: AUTH_JSON_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify({
      country: update.country,
      newsletterOptIn: update.newsletterOptIn,
      contactVkUrl: update.contactVkUrl,
      contactTelegram: update.contactTelegram,
      contactEmail: update.contactEmail,
    }),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(authErrorFromPayload(payload) || 'Не удалось сохранить профиль');
  }
  const user = authUserFromProfilePayload(payload);
  if (!user) throw new Error('Не удалось сохранить профиль');
  return user;
}

/** Logout stays best-effort so clearing local authenticated UI is immediate. */
export async function logoutCurrentAuthSession(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: AUTH_JSON_HEADERS,
    credentials: 'same-origin',
  });
}

/**
 * Sign-in providers linked to the current account (`google`, `discord`,
 * `yandex`, …). Null when the answer is unavailable, so the page leaves the
 * rows out instead of calling a linked provider unlinked.
 */
export async function fetchLinkedSignInProviders(signal?: AbortSignal): Promise<Set<string> | null> {
  try {
    const response = await fetchWithDeadline('/api/account/linked-providers', { signal, deadlineMs: 10_000 });
    if (!response.ok) return null;
    const payload: unknown = await response.json().catch(() => null);
    const providers = (payload as { providers?: unknown } | null)?.providers;
    if (!Array.isArray(providers)) return null;
    return new Set(providers.filter((provider): provider is string => typeof provider === 'string'));
  } catch {
    return null;
  }
}

/** The account's signed-in browsers, this one first. Null when the answer is unavailable. */
export async function fetchAccountSessions(signal?: AbortSignal): Promise<AccountSession[] | null> {
  try {
    const response = await fetchWithDeadline('/api/account/sessions', { signal, deadlineMs: 10_000 });
    if (!response.ok) return null;
    return accountSessionsFromPayload(await response.json().catch(() => null));
  } catch {
    return null;
  }
}

async function postSessionChange(path: string, failure: string): Promise<number> {
  const response = await fetchWithDeadline(path, { method: 'POST', headers: AUTH_JSON_HEADERS, deadlineMs: 10_000 });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(authErrorFromPayload(payload) || failure);
  const revoked = (payload as { revoked?: unknown }).revoked;
  return typeof revoked === 'number' ? revoked : 0;
}

/** Ends one of the account's other sessions; it is refused on its next request. */
export function revokeAccountSession(id: string): Promise<number> {
  return postSessionChange(`/api/account/sessions/${encodeURIComponent(id)}/revoke`, 'Не удалось завершить сеанс');
}

/** Ends every session of the account except this browser's; resolves with how many ended. */
export function revokeOtherAccountSessions(): Promise<number> {
  return postSessionChange('/api/account/sessions/revoke-others', 'Не удалось завершить сеансы');
}

/** The signed-in person's public link and nickname state. Null when the answer is unavailable. */
export async function fetchOwnPublicProfile(signal?: AbortSignal): Promise<OwnPublicProfile | null> {
  try {
    const response = await fetchWithDeadline('/api/account/public-profile', { signal, deadlineMs: 10_000 });
    if (!response.ok) return null;
    return ownPublicProfileFromPayload(await response.json().catch(() => null));
  } catch {
    return null;
  }
}

/** Saves a nickname; rejects with the server's Russian message (taken, reserved, cooldown, …). */
export async function saveOwnNickname(nickname: string): Promise<OwnPublicProfile> {
  const response = await fetchWithDeadline('/api/account/public-profile/nickname', {
    method: 'PUT', headers: AUTH_JSON_HEADERS, body: JSON.stringify({ nickname }), deadlineMs: 10_000,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  const saved = response.ok ? ownPublicProfileFromPayload(payload) : null;
  if (!saved) throw new Error(authErrorFromPayload(payload) || 'Не удалось сохранить ник');
  return saved;
}
