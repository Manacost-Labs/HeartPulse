import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';
import { referralClickFromRow } from './referrals.js';

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
};

type ReferralRow = Record<string, unknown>;

export function slugifyReferral(value: unknown, now = Date.now()): string {
  const raw = String(value ?? '').trim().toLowerCase();
  const translit = raw
    .replace(/а/g, 'a').replace(/б/g, 'b').replace(/в/g, 'v').replace(/г/g, 'g')
    .replace(/д/g, 'd').replace(/е/g, 'e').replace(/ё/g, 'e').replace(/ж/g, 'zh')
    .replace(/з/g, 'z').replace(/и/g, 'i').replace(/й/g, 'y').replace(/к/g, 'k')
    .replace(/л/g, 'l').replace(/м/g, 'm').replace(/н/g, 'n').replace(/о/g, 'o')
    .replace(/п/g, 'p').replace(/р/g, 'r').replace(/с/g, 's').replace(/т/g, 't')
    .replace(/у/g, 'u').replace(/ф/g, 'f').replace(/х/g, 'h').replace(/ц/g, 'c')
    .replace(/ч/g, 'ch').replace(/ш/g, 'sh').replace(/щ/g, 'sch').replace(/ы/g, 'y')
    .replace(/э/g, 'e').replace(/ю/g, 'yu').replace(/я/g, 'ya')
    .replace(/[ъь]/g, '');
  return translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)
    || `ref-${now.toString(36)}`;
}

export function normalizeReferralTarget(value: unknown, appUrl: string): string {
  const raw = String(value ?? '/').trim();
  if (!raw || raw === '#') return '/';
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
  };
}

export function createReferralRouter(dependencies: ReferralRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? (() => `ref_${randomBytes(6).toString('hex')}`);
  const mapReferral = (row: ReferralRow) => referralFromRow(row, dependencies.appUrl);
  const ipHash = (request: Request) => createHash('sha256')
    .update(`${dependencies.ipHashSalt}:${dependencies.clientIp(request)}`)
    .digest('hex');

  router.post('/referrals/track/:slug', (request, response) => {
    const slug = slugifyReferral(request.params.slug);
    if (!slug) return response.status(404).json({ error: 'Ссылка не найдена' });
    try {
      const database = dependencies.getDatabase();
      const link = database.prepare("SELECT * FROM referral_links WHERE slug = ? AND status = 'active'")
        .get(slug) as ReferralRow | undefined;
      if (!link) return response.status(404).json({ error: 'Ссылка не найдена', targetUrl: `${dependencies.appUrl}/` });

      database.prepare(`
        INSERT INTO referral_clicks (referral_id, clicked_at, ip_hash, user_agent, referrer, landing_path)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        String(link.id),
        now().toISOString(),
        ipHash(request),
        String(request.headers['user-agent'] || '').slice(0, 500),
        String(request.headers.referer || request.headers.referrer || '').slice(0, 500),
        String(request.body?.landingPath || request.originalUrl || '').slice(0, 500),
      );

      const targetPath = normalizeReferralTarget(link.target_path, dependencies.appUrl);
      return response.json({ success: true, targetPath, targetUrl: `${dependencies.appUrl}${targetPath}` });
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
          MAX(clicks.clicked_at) AS last_click_at
        FROM referral_links AS link
        LEFT JOIN referral_clicks AS clicks ON clicks.referral_id = link.id
        GROUP BY link.id
        ORDER BY link.created_at DESC
      `).all() as ReferralRow[];
      const recentClicks = database.prepare(`
        SELECT clicks.id, clicks.referral_id, links.slug, clicks.clicked_at, clicks.user_agent, clicks.referrer, clicks.landing_path
        FROM referral_clicks AS clicks
        JOIN referral_links AS links ON links.id = clicks.referral_id
        ORDER BY clicks.clicked_at DESC
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
