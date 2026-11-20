import { Router, type RequestHandler } from 'express';
import { addGuideHeadingIds, guideHtmlSource, prepareGuide } from './guides/excerpt.js';
import { createOldGuideSanitizer } from './guides/sanitize.js';
import { createGuidesListRoute } from './guidesArchiveList.js';

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

export { escapeGuideLike } from './guidesArchiveList.js';

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

type GuideSanitizer = ReturnType<typeof createOldGuideSanitizer>;

/** The description of a guide that has none: the start of the open part only, never of the whole body. */
function openGuideDescription(row: Record<string, unknown>, sanitizer: GuideSanitizer): string {
  return excerptText(prepareGuide(row, sanitizer).excerptHtml, 220);
}

function guideListItem(row: Record<string, unknown>, sanitizer: GuideSanitizer) {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title ?? ''),
    description: excerptText(row.description || row.body_text || row.body_html, 220),
    image: sanitizer.normalizeAssetUrl(row.image) || null,
    publishedAt: row.published_iso ? String(row.published_iso) : (row.published_at ? new Date(Number(row.published_at) * 1000).toISOString() : null),
    menuName: row.menu_name ? String(row.menu_name) : null,
    menuCode: row.menu_code ? String(row.menu_code) : null,
    kind: row.kind ? String(row.kind) : null,
    kindSlug: row.kind_slug ? String(row.kind_slug) : null,
    oldUrl: sanitizer.normalizeLink(row.old_url),
  };
}

function publicGuideTeaserRoute(dependencies: GuidesArchiveRouterDependencies, sanitizer: GuideSanitizer,
  logError: (message: string, error: unknown) => void): RequestHandler {
  return (request, response) => {
    const key = String(request.params.slug ?? '').trim();
    if (!key || key.length > 160 || /[\x00-\x1f]/.test(key)) {
      return response.status(400).json({ error: 'Некорректный адрес гайда' });
    }
    try {
      const row = dependencies.getDatabase().prepare(`
        SELECT id, slug, old_url, published_at, published_iso, title, description,
               image, menu_name, menu_code, kind, kind_slug, body_text, body_html, free_html, short_html
        FROM guides
        WHERE slug = ? OR CAST(id AS TEXT) = ?
        LIMIT 1
      `).get(key, key);
      if (!row) return response.status(404).json({ error: 'Гайд не найден' });
      const item = guideListItem(row, sanitizer);
      // Only the open part leaves the server; the rest of the text is cut here, not in the page.
      const guide = prepareGuide(row, sanitizer);
      // Without its own description the guide is described by the open part, not by the start of the whole body.
      if (!String(row.description ?? '').trim()) item.description = excerptText(guide.excerptHtml, 220);
      response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      return response.json({
        slug: item.slug, title: item.title, description: item.description,
        image: item.image, publishedAt: item.publishedAt,
        // The archive is frozen: a guide is never edited after publication.
        updatedAt: item.publishedAt,
        kind: item.kind, kindSlug: item.kindSlug, menuName: item.menuName,
        excerptHtml: guide.excerptHtml, toc: guide.toc, hasPaid: guide.hasPaid, indexable: guide.indexable,
      });
    } catch (error: unknown) {
      logError('[guides-archive] teaser failed:', error instanceof Error ? error.message : error);
      return response.status(500).json({ error: 'Не удалось загрузить превью гайда' });
    }
  };
}

export function createGuidesArchiveRouter(dependencies: GuidesArchiveRouterDependencies): Router {
  const router = Router();
  const sanitizer = createOldGuideSanitizer(dependencies.publicUrl);
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=600';
  const logError = dependencies.logError ?? ((message: string, error: unknown) => console.error(message, error));
  const rowToListItem = (row: any) => guideListItem(row, sanitizer);

  router.get('/guides-archive/teaser/:slug', publicGuideTeaserRoute(dependencies, sanitizer, logError));

  const listRoute = createGuidesListRoute({ getDatabase: dependencies.getDatabase, cacheHeader, logError, toItem: rowToListItem,
    openDescription: row => openGuideDescription(row, sanitizer) });

  router.get('/guides-archive/public/list', listRoute(false));
  router.get('/guides-archive', dependencies.accessGuard, listRoute(true));

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

      // The legacy CMS split the introduction and paid continuation into separate fields.
      const htmlSource = guideHtmlSource(row);
      return response.json({
        ...rowToListItem(row),
        keywords: row.keywords || null,
        replyCount: Number(row.reply_count || 0),
        contentHtml: addGuideHeadingIds(sanitizer.sanitizeHtml(htmlSource)),
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
