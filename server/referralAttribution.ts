/**
 * Referral attribution (docs/specs/admin-crm.md, «Referral funnel»).
 *
 * A click on /r/:slug stores a signed reference to that click in a first-party cookie for 30 days.
 * The session check (`GET /api/auth/me`, which both frontends call on load) links an account
 * created after the click to the campaign once and clears the cookie. Registration code paths
 * stay untouched, so email, Telegram and OAuth sign-ups are attributed the same way.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { cookieValues } from './authSessions.js';

export const REFERRAL_COOKIE = 'hp_ref';
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
// Clock skew between the click and account creation, which are written by different requests.
const CLICK_SKEW_MS = 10 * 60 * 1000;

export const REFERRAL_ATTRIBUTION_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS user_referrals (
    user_id TEXT PRIMARY KEY,
    referral_id TEXT NOT NULL,
    click_id INTEGER,
    clicked_at TEXT NOT NULL,
    attributed_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(referral_id) REFERENCES referral_links(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_user_referrals_referral ON user_referrals(referral_id);
`;

export type ReferralCookie = { referralId: string; clickId: number };

/** HMAC over `<referralId>.<clickId>` so a visitor cannot claim a click they did not make. */
export function signReferralCookie(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22);
}

/** Cookie value: `<referralId>.<clickId>.<signature>`; referral ids never contain dots. */
export function parseReferralCookie(raw: string, secret: string): ReferralCookie | null {
  const match = /^([A-Za-z0-9_-]{1,64})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(raw);
  if (!match) return null;
  const expected = Buffer.from(signReferralCookie(`${match[1]}.${match[2]}`, secret));
  const actual = Buffer.from(match[3]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { referralId: match[1], clickId: Number(match[2]) };
}

export function setReferralCookie(response: Response, value: ReferralCookie | null, secure: boolean, secret: string): void {
  const payload = value ? `${value.referralId}.${value.clickId}` : '';
  const attributes = [
    'Path=/',
    `Max-Age=${value ? REFERRAL_COOKIE_MAX_AGE_SECONDS : 0}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
  response.append('Set-Cookie', `${REFERRAL_COOKIE}=${value ? `${payload}.${signReferralCookie(payload, secret)}` : ''}; ${attributes}`);
}

export type ReferralAttributionDependencies = {
  getDatabase: () => DatabaseSync;
  userAuth: (request: Request) => { id: string; createdAt?: string } | null;
  cookieSecure: (request: Request) => boolean;
  /** Signing secret shared with the click handlers (the referral IP-hash salt). */
  ipHashSalt: string;
};

/**
 * Mount on `GET /api/auth/me` only: that request already resolves the session, so attribution adds
 * one indexed insert per signed-in visitor with a pending click and nothing for anyone else.
 * Dependencies are resolved per request so the middleware can be mounted before they are declared.
 */
export function createReferralAttributionMiddleware(dependencies: () => ReferralAttributionDependencies): RequestHandler {
  return (request, response, next) => {
    const raw = cookieValues(request.headers.cookie, REFERRAL_COOKIE)[0];
    if (!raw || request.method !== 'GET') return next();
    try {
      const resolved = dependencies();
      const cookie = parseReferralCookie(raw, resolved.ipHashSalt);
      if (!cookie) {
        setReferralCookie(response, null, resolved.cookieSecure(request), resolved.ipHashSalt);
        return next();
      }
      const user = resolved.userAuth(request);
      if (!user) return next();
      const createdAt = Date.parse(user.createdAt ?? '');
      if (Number.isFinite(createdAt)) {
        // The click time comes from our own record, never from the cookie.
        resolved.getDatabase().prepare(`
          INSERT OR IGNORE INTO user_referrals (user_id, referral_id, click_id, clicked_at, attributed_at)
          SELECT ?, c.referral_id, c.id, c.clicked_at, ?
          FROM referral_clicks c JOIN referral_links l ON l.id = c.referral_id
          WHERE c.id = ? AND c.referral_id = ? AND l.status = 'active' AND c.clicked_at <= ?
        `).run(user.id, new Date().toISOString(), cookie.clickId, cookie.referralId, new Date(createdAt + CLICK_SKEW_MS).toISOString());
      }
      setReferralCookie(response, null, resolved.cookieSecure(request), resolved.ipHashSalt);
    } catch {
      // Attribution is best effort and must never break the session check it rides on.
    }
    return next();
  };
}
