import type { RequestHandler } from 'express';
type Row = Record<string, unknown>;
type ListDatabase = { prepare: (sql: string) => { get: (...params: unknown[]) => Row | undefined; all: (...params: unknown[]) => Row[] } };

export function escapeGuideLike(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

/**
 * The archive list. The open one (`fullText` false) is for everyone: only the search differs, and a failure
 * answers from the last good copy of the same request or with 503 and Retry-After.
 */
export function createGuidesListRoute({ getDatabase, cacheHeader, logError, toItem, openDescription }: {
  getDatabase: () => ListDatabase; cacheHeader: string; logError: (message: string, error: unknown) => void;
  toItem: (row: Row) => { description: string };
  /** The description of a guide without one, from its open part (`free_html`, `body_html`, `short_html` of the row). */
  openDescription: (row: Row) => string;
}) {
  // The list is open to everyone: only the search differs. A guest's search never reads the paid text
  // (`body_text`), so it cannot tell whether a word stands in the closed part.
  // A guest's card: the row never carries the body. A guide without a description is described by its open part,
  // read from the text columns of that one row and cut here; the text itself is not returned.
  const guestItem = (database: ListDatabase, row: Row) => {
    const item = { ...toItem(row), oldUrl: null };
    if (!item.description.trim()) {
      const text = database.prepare('SELECT free_html, body_html, short_html FROM guides WHERE id = ?').get(row.id);
      item.description = text ? openDescription(text) : '';
    }
    return item;
  };
  const lastOpenList = new Map<string, unknown>();
  const rememberOpenList = (key: string, body: unknown) => {
    lastOpenList.delete(key);
    lastOpenList.set(key, body);
    if (lastOpenList.size > 200) lastOpenList.delete(lastOpenList.keys().next().value as string);
  };
  return (fullText: boolean): RequestHandler => (request, response) => {
    response.set('Cache-Control', cacheHeader);
    try {
      const database = getDatabase();
      const page = Math.max(1, Math.min(9999, Number(request.query.page || 1) || 1));
      const limit = Math.max(6, Math.min(48, Number(request.query.limit || 18) || 18));
      const offset = (page - 1) * limit;
      const search = String(request.query.q ?? '').trim();
      const kind = String(request.query.kind ?? '').trim();
      const menu = String(request.query.menu ?? '').trim();
      const where: string[] = ['1=1'];
      const params: unknown[] = [];

      if (search) {
        const like = `%${escapeGuideLike(search)}%`;
        const columns = fullText ? ['title', 'description', 'keywords', 'body_text'] : ['title', 'description', 'keywords'];
        where.push(`(${columns.map(column => `${column} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
        params.push(...columns.map(() => like));
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
        SELECT id, slug, old_url, published_at, published_iso, title, description, image, menu_name, menu_code, kind, kind_slug${fullText ? ', body_text, body_html' : ''}
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

      const body = {
        page,
        limit,
        total: Number(totalRow?.total ?? 0),
        totalPages: Math.max(1, Math.ceil(Number(totalRow?.total ?? 0) / limit)),
        // A guest's items carry no address of the legacy site, where the whole text stands.
        items: rows.map(row => fullText ? toItem(row) : guestItem(database, row)),
        filters: {
          kinds: kindRows.map(row => ({ slug: String(row.slug || 'other'), label: String(row.label || 'Другое'), count: Number(row.count || 0) })),
          menus: menuRows.map(row => ({ slug: String(row.slug || ''), label: String(row.label || 'Без раздела'), count: Number(row.count || 0) })),
        },
      };
      if (!fullText) rememberOpenList(request.originalUrl, body);
      return response.json(body);
    } catch (error: unknown) {
      logError('[guides-archive] list failed:', error instanceof Error ? error.message : error);
      if (!fullText) {
        // The open list answers from the last good copy of the same request, else asks to come back.
        // A prerender read (the page's regeneration) gets no stale copy: Next would keep it for minutes, so the
        // page keeps its earlier one instead.
        const last = request.get('X-Hearthpulse-Prerender') ? undefined : lastOpenList.get(request.originalUrl) as object | undefined;
        if (last) return response.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=60').json({ ...last, warning: 'stale' });
        response.set('Retry-After', '60');
        response.set('Cache-Control', 'no-store');
        return response.status(503).json({ error: 'Архив гайдов временно недоступен' });
      }
      return response.status(500).json({ error: 'Не удалось загрузить архив гайдов' });
    }
  };
}
