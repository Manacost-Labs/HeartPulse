import { TelegramAuthIdentityError } from './model.js';

const TELEGRAM_ID_PATTERN = /^[1-9]\d{0,19}$/;
const OIDC_SUB_MAX_LENGTH = 255;
const TELEGRAM_IDENTITY_FIELDS = [
  'first_name',
  'id',
  'last_name',
  'photo_url',
  'username',
] as const;
const TELEGRAM_LOGIN_WIDGET_FIELDS = new Set(['auth_date', ...TELEGRAM_IDENTITY_FIELDS]);

export type TelegramAuthMode = 'oidc' | 'legacy-widget' | 'disabled';

export function assertTelegramAuthEnvironment(input: {
  botToken: string;
  botUsername: string;
  oidcClientId: string;
  oidcClientSecret: string;
}): void {
  if (Boolean(input.botToken.trim()) !== Boolean(input.botUsername.trim())) {
    throw new Error('Telegram bot auth requires both TELEGRAM_AUTH_BOT_TOKEN and TELEGRAM_AUTH_BOT_USERNAME');
  }
  if (Boolean(input.oidcClientId.trim()) !== Boolean(input.oidcClientSecret.trim())) {
    throw new Error('Telegram OIDC requires both TELEGRAM_OIDC_CLIENT_ID and TELEGRAM_OIDC_CLIENT_SECRET');
  }
}

export function telegramLinkCodeTtlMs(value: unknown): number {
  const parsed = Number(value ?? 15 * 60_000);
  return Number.isFinite(parsed)
    ? Math.max(5 * 60_000, Math.min(60 * 60_000, Math.floor(parsed)))
    : 15 * 60_000;
}

export function assertTelegramOidcAudience(
  payload: { aud?: unknown; azp?: unknown },
  clientId: string,
): void {
  const audience = typeof payload.aud === 'string'
    ? [payload.aud]
    : Array.isArray(payload.aud) && payload.aud.every(value => typeof value === 'string')
      ? payload.aud
      : [];
  if (!clientId || !audience.includes(clientId)) {
    throw new Error('Некорректный audience Telegram');
  }
  if (audience.length > 1 && typeof payload.azp !== 'string') {
    throw new Error('Telegram не передал authorized party');
  }
  if (payload.azp !== undefined && payload.azp !== clientId) {
    throw new Error('Некорректный authorized party Telegram');
  }
}

export function telegramAuthMode(input: {
  oidcEnabled: boolean;
  legacyEnabled: boolean;
}): TelegramAuthMode {
  if (input.oidcEnabled) return 'oidc';
  return input.legacyEnabled ? 'legacy-widget' : 'disabled';
}

export function normalizeTelegramLinkCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  const commandPayload = raw.match(/^\/(?:start|link)\s+(.+)$/i)?.[1];
  const candidate = String(commandPayload ?? raw).trim();
  return /^TG-[A-Za-z0-9_-]{24}$/.test(candidate) ? candidate : '';
}

export function legacyTelegramIdentityPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(TELEGRAM_IDENTITY_FIELDS
    .filter(field => payload[field] !== undefined)
    .map(field => [field, payload[field]]));
}

export function telegramBotIdentityPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = legacyTelegramIdentityPayload(value as Record<string, unknown>);
  try {
    const id = parseTelegramId(payload.id);
    return id ? { ...payload, id } : null;
  } catch {
    return null;
  }
}

export function telegramDisplayText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, maxLength);
}

function parseTelegramId(value: unknown): string {
  const present = value !== undefined && value !== null && value !== '';
  if (!present) return '';
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new TelegramAuthIdentityError(
      'INVALID_TELEGRAM_ID',
      'Telegram передал некорректный ID пользователя',
    );
  }
  const telegramId = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  if (!TELEGRAM_ID_PATTERN.test(telegramId)) {
    throw new TelegramAuthIdentityError(
      'INVALID_TELEGRAM_ID',
      'Telegram передал некорректный ID пользователя',
    );
  }
  return telegramId;
}

function parseOidcSub(value: unknown): string {
  const present = value !== undefined && value !== null && value !== '';
  if (!present) return '';
  if (typeof value !== 'string'
    || value !== value.trim()
    || value.length > OIDC_SUB_MAX_LENGTH
    || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TelegramAuthIdentityError(
      'INVALID_OIDC_SUB',
      'Telegram передал некорректный OIDC subject',
    );
  }
  return value;
}

export function normalizedTelegramEmail(value: unknown): string {
  return telegramDisplayText(value, 320).toLowerCase();
}

function telegramPhotoUrl(value: unknown): string {
  const candidate = telegramDisplayText(value, 2_048);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch {
    return '';
  }
}

export function parseTelegramAuthPayload(payload: Record<string, unknown>) {
  const telegramId = parseTelegramId(payload.id);
  const oidcSub = parseOidcSub(payload.oidc_sub);
  if (!telegramId && !oidcSub) {
    throw new TelegramAuthIdentityError(
      'IDENTITY_REQUIRED',
      'Telegram не передал ID пользователя',
    );
  }
  return {
    telegramId,
    oidcSub,
    firstName: telegramDisplayText(payload.first_name, 128),
    lastName: telegramDisplayText(payload.last_name, 128),
    username: telegramDisplayText(payload.username, 64).replace(/^@/, ''),
    photoUrl: telegramPhotoUrl(payload.photo_url),
  };
}

export function telegramLoginWidgetDataCheckString(
  payload: Record<string, unknown>,
): string {
  return Object.entries(payload)
    .filter(([key, value]) => (
      TELEGRAM_LOGIN_WIDGET_FIELDS.has(key)
      && value !== undefined
      && value !== null
      && value !== ''
      && ['string', 'number', 'boolean'].includes(typeof value)
    ))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
}
