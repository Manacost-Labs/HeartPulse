import { authErrorFromPayload } from '../model/authUser';

const LINK_HEADERS = {
  'Content-Type': 'application/json',
  'X-CSRF-Request': '1',
};

async function telegramLinkPayload(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: LINK_HEADERS,
    credentials: 'same-origin',
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(authErrorFromPayload(payload) || 'Не удалось начать привязку Telegram');
  }
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

export function telegramBotLinkResultFromPayload(
  payload: Record<string, unknown>,
  now = Date.now(),
): { code: string; expiresAt: string; botUsername: string } {
  const code = typeof payload.code === 'string' ? payload.code : '';
  const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt : '';
  const botUsername = typeof payload.botUsername === 'string'
    ? payload.botUsername.replace(/^@/, '')
    : '';
  const expiresAtMs = Date.parse(expiresAt);
  if (!/^TG-[A-Za-z0-9_-]{24}$/.test(code)
    || !/^[A-Za-z0-9_]{5,32}$/.test(botUsername)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= now) {
    throw new Error('Telegram вернул некорректный или устаревший ID-код');
  }
  return { code, expiresAt, botUsername };
}

export function telegramOidcLinkUrlFromPayload(payload: Record<string, unknown>): string {
  const authUrl = typeof payload.authUrl === 'string' ? payload.authUrl : '';
  try {
    const parsed = new URL(authUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'oauth.telegram.org') throw new Error();
    return parsed.toString();
  } catch {
    throw new Error('Telegram не вернул безопасный адрес авторизации');
  }
}

export async function requestTelegramBotLinkCode(): Promise<{
  code: string;
  expiresAt: string;
  botUsername: string;
}> {
  const payload = await telegramLinkPayload('/api/auth/telegram/link-code');
  return telegramBotLinkResultFromPayload(payload);
}

export async function startTelegramOidcAccountLink(): Promise<string> {
  const payload = await telegramLinkPayload('/api/auth/telegram/link-start');
  return telegramOidcLinkUrlFromPayload(payload);
}
