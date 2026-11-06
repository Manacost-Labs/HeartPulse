import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HS256 only, with the extension secret that Twitch shows in base64. Twitch
 * signs the viewer JWT with it and the site signs its own `external` JWT for
 * Helix with it; no other algorithm is accepted, so `alg: none` cannot pass.
 */
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

const sign = (input: string, secret: Buffer) => createHmac('sha256', secret).update(input).digest();

export function signTwitchJwt(payload: Record<string, unknown>, secret: Buffer): string {
  const body = `${HEADER}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${body}.${sign(body, secret).toString('base64url')}`;
}

/** The `external` JWT that lets the site broadcast into one channel; valid for a minute. */
export function externalPubsubJwt(options: {
  channelId: string;
  ownerId: string;
  secret: Buffer;
  now: number;
}): string {
  return signTwitchJwt({
    exp: Math.floor(options.now / 1000) + 60,
    user_id: options.ownerId,
    role: 'external',
    channel_id: options.channelId,
    pubsub_perms: { send: ['broadcast'] },
  }, options.secret);
}

export type TwitchViewerClaims = { channelId: string; role: string; opaqueUserId: string };

/** Verifies the JWT a viewer's extension got from `Twitch.ext.onAuthorized`; null when it is not valid now. */
export function verifyTwitchJwt(token: string, secret: Buffer, now: number): TwitchViewerClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 4096) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!header || typeof header !== 'object' || (header as Record<string, unknown>).alg !== 'HS256') return null;
  const expected = sign(`${headerPart}.${payloadPart}`, secret);
  const actual = Buffer.from(signaturePart, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  if (!payload || typeof payload !== 'object') return null;
  const claims = payload as Record<string, unknown>;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
  if (typeof claims.channel_id !== 'string' || !/^[0-9]{1,32}$/.test(claims.channel_id)) return null;
  return {
    channelId: claims.channel_id,
    role: typeof claims.role === 'string' ? claims.role : '',
    opaqueUserId: typeof claims.opaque_user_id === 'string' ? claims.opaque_user_id : '',
  };
}
