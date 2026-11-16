import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import { authErrorFromPayload } from '../model/authUser';

export type TwitchLinkState = {
  configured: boolean;
  linked: boolean;
  login: string | null;
  displayName: string | null;
};

/** Starts the Twitch OAuth flow; a full-page navigation, not a fetch. */
export const TWITCH_CONNECT_URL = '/api/account/twitch/connect';

const nullableText = (value: unknown) => value === null || typeof value === 'string';

/** The account's Twitch link; null when the answer is unavailable. */
export async function fetchTwitchLink(signal?: AbortSignal): Promise<TwitchLinkState | null> {
  try {
    const response = await fetchWithDeadline('/api/account/twitch', { signal, deadlineMs: 10_000 });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || typeof payload.configured !== 'boolean' || typeof payload.linked !== 'boolean'
      || !nullableText(payload.login) || !nullableText(payload.displayName)) return null;
    return payload as TwitchLinkState;
  } catch {
    return null;
  }
}

export async function unlinkTwitch(): Promise<void> {
  const response = await fetchWithDeadline('/api/account/twitch', {
    method: 'DELETE', headers: { 'X-CSRF-Request': '1' }, deadlineMs: 10_000,
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new Error(authErrorFromPayload(payload) || 'Не удалось отвязать Twitch');
  }
}
