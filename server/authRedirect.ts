import { createHmac, timingSafeEqual } from 'node:crypto';

const AUTH_REDIRECT_BASE = 'https://arena.invalid';
const MAX_SIGNED_STATE_COOKIE_LENGTH = 8_192;

export function safeAuthReturnTo(value: unknown, fallback = '/?login&telegram=ok'): string {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('\\') || /%5c/i.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  try {
    const parsed = new URL(raw, AUTH_REDIRECT_BASE);
    if (parsed.origin !== AUTH_REDIRECT_BASE) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function encodeSignedStateCookie(value: unknown, secret: string): string {
  if (!secret) throw new Error('OIDC state cookie secret is required');
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function decodeSignedStateCookie(raw: string, secret: string): unknown | null {
  if (!secret || !raw || raw.length > MAX_SIGNED_STATE_COOKIE_LENGTH) return null;
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;
  const expected = createHmac('sha256', secret).update(payload).digest();

  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
