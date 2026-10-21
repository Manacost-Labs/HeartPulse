import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import {
  authUserFromProfilePayload,
  type AuthProfileUpdate,
} from '../model/authProfile';
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
