export type TelegramAuthMode = 'legacy-widget' | 'oidc' | 'disabled';

export type TelegramAuthConfig = {
  enabled: boolean;
  mode: TelegramAuthMode;
  botUsername: string;
  authUrl: string;
  callbackUrl: string;
  legacyIntentExpiresAt: number;
};

const LEGACY_INTENT_REFRESH_SKEW_MS = 60_000;
const LEGACY_INTENT_STALE_RETRY_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function telegramAuthConfigRefreshDelay(
  expiresAt: number,
  now: number,
): number | null {
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return Math.max(
    LEGACY_INTENT_STALE_RETRY_MS,
    expiresAt - now - LEGACY_INTENT_REFRESH_SKEW_MS,
  );
}

export async function fetchTelegramAuthConfig(): Promise<TelegramAuthConfig> {
  const response = await fetch('/api/auth/telegram/config', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(payload)) throw new Error('Telegram auth config unavailable');
  const mode: TelegramAuthMode = payload.mode === 'legacy-widget'
    ? 'legacy-widget'
    : payload.mode === 'oidc'
      ? 'oidc'
      : 'disabled';
  return {
    enabled: payload.enabled === true && mode !== 'disabled',
    mode,
    botUsername: typeof payload.botUsername === 'string' ? payload.botUsername : '',
    authUrl: typeof payload.authUrl === 'string' ? payload.authUrl : '',
    callbackUrl: typeof payload.callbackUrl === 'string' ? payload.callbackUrl : '',
    legacyIntentExpiresAt: typeof payload.legacyIntentExpiresAt === 'number'
      && Number.isFinite(payload.legacyIntentExpiresAt)
      ? payload.legacyIntentExpiresAt
      : 0,
  };
}
