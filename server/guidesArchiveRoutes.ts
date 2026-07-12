import { Router, type RequestHandler } from 'express';
import { createOldGuideSanitizer } from './guides/sanitize.js';

type GuideStatement = {
  get: (...params: any[]) => any;
  all: (...params: any[]) => any[];
};

export type GuideDatabase = {
  prepare: (sql: string) => GuideStatement;
};

export type GuidesArchiveRouterDependencies = {
  getDatabase: () => GuideDatabase;
  accessGuard: RequestHandler;
  publicUrl: string;
  cacheHeader?: string;
  logError?: (message: string, error: unknown) => void;
};

export function escapeGuideLike(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

function plainText(value: unknown): string {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptText(value: unknown, maxLength = 220): string {
  const text = plainText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

export function createGuidesArchiveRouter(dependencies: GuidesArchiveRouterDependencies): Router {
  const router = Router();
  const sanitizer = createOldGuideSanitizer(dependencies.publicUrl);
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=600';
  const logError = dependencies.logError ?? ((message: string, error: unknown) => console.error(message, error));

  const rowToListItem = (row: any) => ({
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title ?? ''),
    description: excerptText(row.description || row.body_text || row.body_html, 220),
    image: sanitizer.normalizeAssetUrl(row.image) || null,
    publishedAt: row.published_iso || (row.published_at ? new Date(Number(row.published_at) * 1000).toISOString() : null),
    menuName: row.menu_name || null,
    menuCode: row.menu_code || null,
    kind: row.kind || null,
    kindSlug: row.kind_slug || null,
    oldUrl: sanitizer.normalizeLink(row.old_url),
  });

  router.get('/guides-archive', dependencies.accessGuard, (request, response) => {
    response.set('Cache-Control', cacheHeader);
    try {
      const database = dependencies.getDatabase();
      const page = Math.max(1, Math.min(9999, Number(request.query.page || 1) || 1));
      const limit = Math.max(6, Math.min(48, Number(request.query.limit || 18) || 18));
      const offset = (page - 1) * limit;
      const search = String(request.query.q ?? '').trim();
      const kind = String(request.query.kind ?? '').trim();
      const menu = String(request.query.menu ?? '').trim();
      const where: string[] = ['1=1'];
      const params: any[] = [];

      if (search) {
        const like = `%${escapeGuideLike(search)}%`;
        where.push('(title LIKE ? ESCAPE \'\\\' OR description LIKE ? ESCAPE \'\\\' OR keywords LIKE ? ESCAPE \'\\\' OR body_text LIKE ? ESCAPE \'\\\')');
        params.push(like, like, like, like);
      }
      if (kind) {
        where.push('kind_slug = ?');
        params.push(kind);
      }
      if (menu) {
        where.push('menu_code = ?');
        params.push(menu);
      }

      const whereSql = where.join(' AND ');
      const totalRow = database.prepare(`SELECT COUNT(*) AS total FROM guides WHERE ${whereSql}`).get(...params);
      const rows = database.prepare(`
        SELECT id, slug, old_url, published_at, published_iso, title, description, image, menu_name, menu_code, kind, kind_slug, body_text, body_html
        FROM guides
        WHERE ${whereSql}
        ORDER BY published_at DESC, id DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);
      const kindRows = database.prepare(`
        SELECT COALESCE(kind_slug, 'other') AS slug, COALESCE(kind, 'Другое') AS label, COUNT(*) AS count
        FROM guides
        GROUP BY kind_slug, kind
        ORDER BY count DESC, label ASC
      `).all();
      const menuRows = database.prepare(`
        SELECT COALESCE(menu_code, '') AS slug, COALESCE(menu_name, 'Без раздела') AS label, COUNT(*) AS count
        FROM guides
        WHERE menu_name IS NOT NULL AND TRIM(menu_name) <> ''
        GROUP BY menu_code, menu_name
        ORDER BY count DESC, label ASC
        LIMIT 40
      `).all();

      return response.json({
        page,
        limit,
        total: Number(totalRow?.total ?? 0),
        totalPages: Math.max(1, Math.ceil(Number(totalRow?.total ?? 0) / limit)),
        items: rows.map(rowToListItem),
        filters: {
          kinds: kindRows.map(row => ({ slug: String(row.slug || 'other'), label: String(row.label || 'Другое'), count: Number(row.count || 0) })),
          menus: menuRows.map(row => ({ slug: String(row.slug || ''), label: String(row.label || 'Без раздела'), count: Number(row.count || 0) })),
        },
      });
    } catch (error: any) {
      logError('[guides-archive] list failed:', error?.message ?? error);
      return response.status(500).json({ error: 'Не удалось загрузить архив гайдов' });
    }
  });

  router.get('/guides-archive/:slug', dependencies.accessGuard, (request, response) => {
    response.set('Cache-Control', cacheHeader);
    try {
      const database = dependencies.getDatabase();
      const key = String(request.params.slug ?? '').trim();
      const row = database.prepare(`
        SELECT id, slug, old_url, published_at, published_iso, title, description, keywords, image, menu_name, menu_code, kind, kind_slug,
               short_html, free_html, body_html, body_text, reply_count
        FROM guides
        WHERE slug = ? OR CAST(id AS TEXT) = ?
        LIMIT 1
      `).get(key, key);

      if (!row) return response.status(404).json({ error: 'Гайд не найден' });

      const htmlSource = row.body_html || row.free_html || row.short_html || '';
      return response.json({
        ...rowToListItem(row),
        keywords: row.keywords || null,
        replyCount: Number(row.reply_count || 0),
        contentHtml: sanitizer.sanitizeHtml(htmlSource),
        fallbackText: htmlSource ? '' : plainText(row.body_text),
        sourceUrl: sanitizer.normalizeLink(row.old_url),
      });
    } catch (error: any) {
      logError('[guides-archive] detail failed:', error?.message ?? error);
      return response.status(500).json({ error: 'Не удалось загрузить гайд' });
    }
  });

  return router;
}
