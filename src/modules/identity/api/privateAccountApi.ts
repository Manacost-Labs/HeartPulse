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
