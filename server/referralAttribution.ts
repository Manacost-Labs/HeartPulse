/**
 * Referral attribution (docs/specs/admin-crm.md, «Referral funnel»).
 *
 * A click on /r/:slug stores the campaign in a first-party cookie for 30 days. The first
 * authenticated API request of an account created after that click links the account to the
 * campaign once; the cookie is then cleared. Registration code paths stay untouched, which keeps
 * email, Telegram and OAuth sign-ups attributed the same way.
 */
import type { Request, RequestHandler, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { cookieValues } from './authSessions.js';

export const REFERRAL_COOKIE = 'hp_ref';
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
// Clock skew between the click and account creation (different servers write each timestamp).
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

export type ReferralCookie = { referralId: string; clickId: number; clickedAt: number };

/** Cookie value: `<referralId>.<clickId>.<clickedAtMs>`; referral ids never contain dots. */
export function formatReferralCookie(value: ReferralCookie): string {
  return `${value.referralId}.${value.clickId}.${value.clickedAt}`;
}

export function parseReferralCookie(raw: string): ReferralCookie | null {
  const match = /^([A-Za-z0-9_-]{1,64})\.(\d{1,12})\.(\d{10,14})$/.exec(raw);
  if (!match) return null;
  return { referralId: match[1], clickId: Number(match[2]), clickedAt: Number(match[3]) };
}

export function setReferralCookie(response: Response, value: ReferralCookie | null, secure: boolean): void {
  const attributes = [
    'Path=/',
    `Max-Age=${value ? REFERRAL_COOKIE_MAX_AGE_SECONDS : 0}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
  response.append('Set-Cookie', `${REFERRAL_COOKIE}=${value ? formatReferralCookie(value) : ''}; ${attributes}`);
}

export type ReferralAttributionDependencies = {
  getDatabase: () => DatabaseSync;
  userAuth: (request: Request) => { id: string; createdAt?: string } | null;
  cookieSecure: (request: Request) => boolean;
};

/**
 * Dependencies are resolved per request so the middleware can be mounted early in the API chain,
 * before the objects it needs are declared.
 */
export function createReferralAttributionMiddleware(dependencies: () => ReferralAttributionDependencies): RequestHandler {
  return (request, response, next) => {
    const raw = cookieValues(request.headers.cookie, REFERRAL_COOKIE)[0];
    if (!raw) return next();
    try {
      const resolved = dependencies();
      const user = resolved.userAuth(request);
      if (!user) return next();
      const cookie = parseReferralCookie(raw);
      const createdAt = Date.parse(user.createdAt ?? '');
      if (cookie && Number.isFinite(createdAt) && createdAt >= cookie.clickedAt - CLICK_SKEW_MS) {
        resolved.getDatabase().prepare(`
          INSERT OR IGNORE INTO user_referrals (user_id, referral_id, click_id, clicked_at, attributed_at)
          SELECT ?, id, ?, ?, ? FROM referral_links WHERE id = ?
        `).run(user.id, cookie.clickId, new Date(cookie.clickedAt).toISOString(), new Date().toISOString(), cookie.referralId);
      }
      setReferralCookie(response, null, resolved.cookieSecure(request));
    } catch {
      // Attribution is best effort and must never break the request it rides on.
    }
    return next();
  };
}
