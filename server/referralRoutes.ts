import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';
import { referralClickFromRow } from './referrals.js';
import { setReferralCookie } from './referralAttribution.js';
import { slugifyReferral } from './referralSlug.js';

export { slugifyReferral };
import { ACTIVE_MANUAL_GRANT_SQL } from './adminCrmSegments.js';

type AdminIdentity = { id: string };

export type ReferralRouterDependencies = {
  getDatabase: () => DatabaseSync;
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => AdminIdentity | null;
  appUrl: string;
  clientIp: (request: Request) => string;
  ipHashSalt: string;
  now?: () => Date;
  createId?: () => string;
  /** Whether the attribution cookie is marked Secure; defaults to an https appUrl. */
  cookieSecure?: (request: Request) => boolean;
};

type ReferralRow = Record<string, unknown>;

export function normalizeReferralTarget(value: unknown, appUrl: string): string {
  const raw = String(value ?? '/').trim();
  if (!raw || raw === '#' || raw.startsWith('//') || raw.includes('\\')) return '/';
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      const applicationUrl = new URL(appUrl);
      if (url.hostname !== applicationUrl.hostname) return '/';
      return `${url.pathname || '/'}${url.search || ''}${url.hash || ''}`;
    }
  } catch {
    return '/';
  }
  return raw.startsWith('/') ? raw : '/';
}

function trackReferralClick(
  dependencies: ReferralRouterDependencies,
  request: Request,
  clickedAt: Date,
  landingPath: string,
): { targetPath: string; referralId: string; clickId: number; clickedAt: number } | null {
  const rawSlug = String(request.params.slug ?? '').trim();
  if (!rawSlug) return null;
  const slug = slugifyReferral(rawSlug, clickedAt.getTime());
  const database = dependencies.getDatabase();
  const link = database.prepare("SELECT * FROM referral_links WHERE slug = ? AND status = 'active'")
    .get(slug) as ReferralRow | undefined;
  if (!link) return null;

  const hashedIp = createHash('sha256')
    .update(`${dependencies.ipHashSalt}:${dependencies.clientIp(request)}`)
    .digest('hex');
  const inserted = database.prepare(`
    INSERT INTO referral_clicks (referral_id, clicked_at, ip_hash, user_agent, referrer, landing_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(link.id),
    clickedAt.toISOString(),
    hashedIp,
    String(request.headers['user-agent'] || '').slice(0, 500),
    String(request.headers.referer || request.headers.referrer || '').slice(0, 500),
    landingPath.slice(0, 500),
  );

  return {
    targetPath: normalizeReferralTarget(link.target_path, dependencies.appUrl),
    referralId: String(link.id),
    clickId: Number(inserted.lastInsertRowid),
    clickedAt: clickedAt.getTime(),
  };
}

type Tracked = NonNullable<ReturnType<typeof trackReferralClick>>;
function rememberReferral(dependencies: ReferralRouterDependencies, request: Request, response: Parameters<RequestHandler>[1], referral: Tracked): void {
  setReferralCookie(response, referral, dependencies.cookieSecure?.(request) ?? dependencies.appUrl.startsWith('https://'));
}

function setReferralDocumentHeaders(response: Parameters<RequestHandler>[1]): void {
  response.set({
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
}

export function createReferralRedirectHandler(
  dependencies: ReferralRouterDependencies,
): RequestHandler {
  const now = dependencies.now ?? (() => new Date());
  return (request, response) => {
    setReferralDocumentHeaders(response);
    try {
      const referral = trackReferralClick(
        dependencies,
        request,
        now(),
        request.originalUrl || request.url || '/',
      );
      if (!referral) return response.status(404).type('text/plain').send('Ссылка не найдена');
      rememberReferral(dependencies, request, response, referral);
      return response.redirect(302, referral.targetPath);
    } catch (error: any) {
      response.set('Retry-After', '60');
      return response.status(503).type('text/plain').send(error?.message || 'Ссылка временно недоступна');
    }
  };
}

export function referralFromRow(row: ReferralRow, appUrl: string) {
  const slug = String(row.slug || '');
  return {
    id: String(row.id),
    slug,
    label: String(row.label || ''),
    campaign: String(row.campaign || ''),
    targetPath: String(row.target_path || '/'),
    status: String(row.status || 'active'),
    createdBy: String(row.created_by || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    url: `${appUrl}/r/${encodeURIComponent(slug)}`,
    clicks: Number(row.clicks || 0),
    uniqueClicks: Number(row.unique_clicks || 0),
    lastClickAt: row.last_click_at ? String(row.last_click_at) : '',
    registrations: Number(row.registrations || 0),
    payingNow: Number(row.paying_now || 0),
  };
}

export function createReferralRouter(dependencies: ReferralRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? (() => `ref_${randomBytes(6).toString('hex')}`);
  const mapReferral = (row: ReferralRow) => referralFromRow(row, dependencies.appUrl);

  router.post('/referrals/track/:slug', (request, response) => {
    try {
      const referral = trackReferralClick(
        dependencies,
        request,
        now(),
        String(request.body?.landingPath || request.originalUrl || ''),
      );
      if (!referral) {
        return response.status(404).json({
          error: 'Ссылка не найдена',
          targetUrl: `${dependencies.appUrl}/`,
        });
      }
      rememberReferral(dependencies, request, response, referral);
      return response.json({
        success: true,
        targetPath: referral.targetPath,
        targetUrl: `${dependencies.appUrl}${referral.targetPath}`,
      });
    } catch (error: any) {
      return response.status(500).json({ error: error.message || 'Не удалось записать переход' });
    }
  });

  router.get('/admin/referrals', dependencies.adminGuard, (request, response) => {
    if (!dependencies.adminAuth(request)) return response.status(401).json({ error: 'Требуется вход' });
    try {
      const database = dependencies.getDatabase();
      const rows = database.prepare(`
        SELECT
          link.*,
          COUNT(clicks.id) AS clicks,
          COUNT(DISTINCT clicks.ip_hash) AS unique_clicks,
          MAX(clicks.clicked_at) AS last_click_at,
          (SELECT COUNT(*) FROM user_referrals ur WHERE ur.referral_id = link.id) AS registrations,
          (SELECT COUNT(*) FROM user_referrals ur
            LEFT JOIN subscriptions s ON s.user_id = ur.user_id
            LEFT JOIN manual_subscription_grants g ON g.user_id = ur.user_id
            WHERE ur.referral_id = link.id AND (COALESCE(s.has_access, 0) = 1 OR ${ACTIVE_MANUAL_GRANT_SQL})) AS paying_now
        FROM referral_links AS link
        LEFT JOIN referral_clicks AS clicks ON clicks.referral_id = link.id
        GROUP BY link.id
        ORDER BY link.created_at DESC
      `).all() as ReferralRow[];
      const recentClicks = database.prepare(`
        SELECT clicks.id, clicks.referral_id, links.slug, clicks.clicked_at, clicks.user_agent, clicks.referrer, clicks.landing_path
        FROM referral_clicks AS clicks
        JOIN referral_links AS links ON links.id = clicks.referral_id
        ORDER BY clicks.clicked_at DESC, clicks.id DESC
        LIMIT 120
      `).all() as ReferralRow[];
      return response.json({
        referrals: rows.map(mapReferral),
        recentClicks: recentClicks.map(referralClickFromRow),
      });
    } catch (error: any) {
      return response.status(500).json({ error: error.message || 'Не удалось загрузить ссылки' });
    }
  });

  router.post('/admin/referrals', dependencies.adminGuard, (request, response) => {
    const user = dependencies.adminAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    const label = String(request.body?.label || '').trim();
    if (!label) return response.status(400).json({ error: 'Название ссылки обязательно' });
    const slug = slugifyReferral(request.body?.slug || label);
    const status = String(request.body?.status || 'active') === 'paused' ? 'paused' : 'active';
    const timestamp = now().toISOString();
    const id = createId();

    try {
      const database = dependencies.getDatabase();
      database.prepare(`
        INSERT INTO referral_links (id, slug, label, campaign, target_path, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        slug,
        label,
        String(request.body?.campaign || '').trim(),
        normalizeReferralTarget(request.body?.targetPath || request.body?.target_path || '/', dependencies.appUrl),
        status,
        user.id,
        timestamp,
        timestamp,
      );
      const row = database.prepare(`
        SELECT link.*, 0 AS clicks, 0 AS unique_clicks, NULL AS last_click_at
        FROM referral_links AS link
        WHERE link.id = ?
      `).get(id) as ReferralRow;
      return response.json({ success: true, referral: mapReferral(row) });
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE')) {
        return response.status(409).json({ error: 'Такой slug уже занят' });
      }
      return response.status(500).json({ error: error.message || 'Не удалось сохранить ссылку' });
    }
  });

  return router;
}
