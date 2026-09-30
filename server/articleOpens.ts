/**
 * Article reads (docs/specs/admin-crm.md, «Article reads»).
 *
 * A subscriber who receives a link to a paid article is one recorded open. The rows feed the admin
 * article list (opens and distinct readers per article) and the client card (how much one person reads).
 */
type QueryValue = string | number | null;
type ReadRepository = {
  get: (sql: string, ...params: QueryValue[]) => Record<string, unknown> | null;
  all: (sql: string, ...params: QueryValue[]) => Record<string, unknown>[];
};

export const ARTICLE_OPENS_RETENTION_DAYS = 400;
export const ARTICLE_READS_WINDOW_DAYS = 30;
// A double click or a reopened tab within this period is the same read.
const REPEAT_WINDOW_MS = 30 * 60_000;

/** Additive and idempotent; the closing statement keeps the table bounded on every start-up. */
export const ARTICLE_OPENS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS article_opens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_article_opens_article_time ON article_opens(article_id, opened_at);
  CREATE INDEX IF NOT EXISTS idx_article_opens_user_time ON article_opens(user_id, opened_at);
  CREATE INDEX IF NOT EXISTS idx_article_opens_time ON article_opens(opened_at);
  DELETE FROM article_opens WHERE opened_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${ARTICLE_OPENS_RETENTION_DAYS} days');
`;

type RunStatement = (sql: string, ...params: QueryValue[]) => unknown;

/**
 * Records one open unless it repeats a recent one or lacks an article or a reader.
 * Returns nothing: the production statement runner does not report affected rows.
 */
export function recordArticleOpen(run: RunStatement, articleId: string, userId: string, now: Date): void {
  if (!articleId || !userId) return;
  run(`
    INSERT INTO article_opens (article_id, user_id, opened_at)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM article_opens WHERE article_id = ? AND user_id = ? AND opened_at > ?)
  `, articleId, userId, now.toISOString(), articleId, userId, new Date(now.getTime() - REPEAT_WINDOW_MS).toISOString());
}

const pageKey = (value: unknown): string => {
  try {
    const url = new URL(String(value ?? ''));
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return '';
  }
};

/**
 * True when both addresses are the same page (host and path; scheme, query and a trailing slash are ignored).
 * The catalogue also matches an article by its title, which the caller supplies, so a read is counted only
 * when the requested address is that article's own.
 */
export function isSameArticlePage(left: unknown, right: unknown): boolean {
  const key = pageKey(left);
  return Boolean(key) && key === pageKey(right);
}

const windowStart = (now: Date) => new Date(now.getTime() - ARTICLE_READS_WINDOW_DAYS * 86_400_000).toISOString();

/** Opens and distinct readers per article, for the window and for the whole retained history. No reader is named. */
export function readArticleReads(repository: ReadRepository, now: Date) {
  const since = windowStart(now);
  const articles = repository.all(`
    SELECT article_id,
      SUM(CASE WHEN opened_at >= ? THEN 1 ELSE 0 END) AS opens,
      COUNT(DISTINCT CASE WHEN opened_at >= ? THEN user_id END) AS readers,
      COUNT(*) AS opens_total,
      COUNT(DISTINCT user_id) AS readers_total,
      MAX(opened_at) AS last_opened_at
    FROM article_opens GROUP BY article_id
    ORDER BY opens DESC, opens_total DESC, article_id
  `, since, since).map(row => ({
    articleId: String(row.article_id),
    opens: Number(row.opens ?? 0),
    readers: Number(row.readers ?? 0),
    opensTotal: Number(row.opens_total ?? 0),
    readersTotal: Number(row.readers_total ?? 0),
    lastOpenedAt: String(row.last_opened_at ?? ''),
  }));
  const totals = repository.get(`
    SELECT COUNT(*) AS opens, COUNT(DISTINCT user_id) AS readers, (SELECT MIN(opened_at) FROM article_opens) AS first_at
    FROM article_opens WHERE opened_at >= ?
  `, since);
  return {
    days: ARTICLE_READS_WINDOW_DAYS,
    /** When counting began: the oldest retained open, or null before the first one. */
    since: totals?.first_at ? String(totals.first_at) : null,
    totals: { opens: Number(totals?.opens ?? 0), readers: Number(totals?.readers ?? 0) },
    articles,
  };
}

export type ArticleReads = ReturnType<typeof readArticleReads>;

/** One person's reading in the window, and when they last opened anything. */
export function readPersonReading(repository: Pick<ReadRepository, 'get'>, userId: string, now: Date) {
  const since = windowStart(now);
  const row = repository.get(`
    SELECT SUM(CASE WHEN opened_at >= ? THEN 1 ELSE 0 END) AS opens,
      COUNT(DISTINCT CASE WHEN opened_at >= ? THEN article_id END) AS articles,
      MAX(opened_at) AS last_opened_at
    FROM article_opens WHERE user_id = ?
  `, since, since, userId);
  return {
    opens: Number(row?.opens ?? 0),
    articles: Number(row?.articles ?? 0),
    lastOpenedAt: row?.last_opened_at ? String(row.last_opened_at) : null,
  };
}
