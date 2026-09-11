import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';

const COVER_SSO_COOKIE = 'cover_admin_session';
const HANDOFF_TTL_MS = 2 * 60_000;
const SESSION_TTL_MS = 8 * 60 * 60_000;
const MIN_SHARED_SECRET_LENGTH = 32;

type CoverSsoPurpose = 'handoff' | 'session';

type CoverSsoPayload = {
  v: 1;
  audience: 'cover.hs-manacost.ru';
  purpose: CoverSsoPurpose;
  userId: string;
  expiresAt: number;
  nonce: string;
};

type CoverSsoUser = { id: string };

export type CoverAdminSsoDependencies<User extends CoverSsoUser> = {
  authenticate: (request: Request) => User | null;
  resolveUser: (userId: string) => User | null;
  isAdmin: (user: User) => boolean;
  redeemHandoff: (ticketHash: string, expiresAt: number) => boolean;
  signingSecret: string;
  proxyKey: string;
  coverOrigin: string;
  setPrivateNoStore: (response: Response) => void;
  now?: () => number;
  random?: (size: number) => Buffer;
};

function fixedTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function encodePayload(payload: CoverSsoPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
}

function decodePayload(value: string, secret: string, purpose: CoverSsoPurpose, now: number): CoverSsoPayload | null {
  if (!value || value.length > 2_048 || !secret) return null;
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra || !fixedTimeEquals(sign(encoded, secret), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<CoverSsoPayload>;
    if (
      payload.v !== 1
      || payload.audience !== 'cover.hs-manacost.ru'
      || payload.purpose !== purpose
      || typeof payload.userId !== 'string'
      || !payload.userId
      || payload.userId.length > 240
      || typeof payload.expiresAt !== 'number'
      || !Number.isFinite(payload.expiresAt)
      || payload.expiresAt <= now
      || typeof payload.nonce !== 'string'
      || payload.nonce.length < 16
    ) return null;
    return payload as CoverSsoPayload;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string {
  for (const part of String(request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return '';
    }
  }
  return '';
}

function normalizeCoverOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'cover.hs-manacost.ru' || url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function proxyAuthorized(request: Request, proxyKey: string): boolean {
  return Boolean(proxyKey) && fixedTimeEquals(String(request.headers['x-cover-sso-key'] ?? ''), proxyKey);
}

function setCoverSession(response: Response, value: string) {
  response.append('Set-Cookie', [
    `${COVER_SSO_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ].join('; '));
}

/**
 * Browser hand-off and Nginx auth_request boundary for Cover. The Cover host
 * never receives a HearthPulse session token; every protected request resolves
 * the user again and checks their current administrator role here.
 */
export function createCoverAdminSsoRouter<User extends CoverSsoUser>(
  dependencies: CoverAdminSsoDependencies<User>,
): Router {
  const router = Router();
  const coverOrigin = normalizeCoverOrigin(dependencies.coverOrigin);
  const now = dependencies.now ?? Date.now;
  const random = dependencies.random ?? randomBytes;

  const unavailable = (response: Response) => {
    dependencies.setPrivateNoStore(response);
    response.status(503).json({ error: 'Cover SSO is not configured' });
  };
  const configured = () => Boolean(
    coverOrigin
    && dependencies.signingSecret.length >= MIN_SHARED_SECRET_LENGTH
    && dependencies.proxyKey.length >= MIN_SHARED_SECRET_LENGTH,
  );
  const newPayload = (userId: string, purpose: CoverSsoPurpose, ttlMs: number): CoverSsoPayload => ({
    v: 1,
    audience: 'cover.hs-manacost.ru',
    purpose,
    userId,
    expiresAt: now() + ttlMs,
    nonce: random(18).toString('base64url'),
  });

  router.get('/auth/cover/start', (request, response) => {
    if (!configured() || !coverOrigin) return unavailable(response);
    dependencies.setPrivateNoStore(response);
    const user = dependencies.authenticate(request);
    if (!user) return response.redirect(303, '/?login&returnTo=%2Fapi%2Fauth%2Fcover%2Fstart');
    if (!dependencies.isAdmin(user)) return response.status(403).json({ error: 'Доступ к Cover разрешён только администраторам HearthPulse' });

    const ticket = encodePayload(newPayload(user.id, 'handoff', HANDOFF_TTL_MS), dependencies.signingSecret);
    const callback = new URL('/_hearthpulse/callback', coverOrigin);
    callback.searchParams.set('ticket', ticket);
    return response.redirect(303, callback.toString());
  });

  router.get('/auth/cover/callback', (request, response) => {
    if (!configured()) return unavailable(response);
    dependencies.setPrivateNoStore(response);
    if (!proxyAuthorized(request, dependencies.proxyKey)) return response.status(404).end();
    const ticket = String(request.query.ticket ?? '');
    const handoff = decodePayload(ticket, dependencies.signingSecret, 'handoff', now());
    if (!handoff) return response.status(400).json({ error: 'Недействительный или устаревший вход Cover' });
    const ticketHash = createHash('sha256').update(ticket).digest('hex');
    if (!dependencies.redeemHandoff(ticketHash, handoff.expiresAt)) return response.status(400).json({ error: 'Вход Cover уже использован' });
    const user = dependencies.resolveUser(handoff.userId);
    if (!user || !dependencies.isAdmin(user)) return response.status(403).json({ error: 'Доступ к Cover больше не разрешён' });

    setCoverSession(response, encodePayload(newPayload(user.id, 'session', SESSION_TTL_MS), dependencies.signingSecret));
    response.set('Referrer-Policy', 'no-referrer');
    return response.redirect(303, '/');
  });

  router.get('/auth/cover/authorize', (request, response) => {
    if (!configured()) return unavailable(response);
    dependencies.setPrivateNoStore(response);
    if (!proxyAuthorized(request, dependencies.proxyKey)) return response.status(404).end();
    const session = decodePayload(cookieValue(request, COVER_SSO_COOKIE), dependencies.signingSecret, 'session', now());
    if (!session) return response.status(401).end();
    const user = dependencies.resolveUser(session.userId);
    if (!user || !dependencies.isAdmin(user)) return response.status(403).end();
    return response.status(204).end();
  });

  return router;
}
