/**
 * Pure logic for article reads in the admin «Статьи» section: labels, the summary and the
 * «most read first» order. Contract: docs/specs/admin-crm.md, «Article reads».
 */
import { pluralRu } from '../shared/text/pluralRu';
import { formatContentDate, type Article } from './adminContentListModel';

export type ArticleReadStats = {
  articleId: string;
  /** Opens and distinct readers within the window (`ArticleReads.days`). */
  opens: number;
  readers: number;
  opensTotal: number;
  readersTotal: number;
  lastOpenedAt: string;
};

export type ArticleReads = {
  days: number;
  /** When counting began, or null before the first recorded open. */
  since: string | null;
  totals: { opens: number; readers: number };
  articles: ArticleReadStats[];
};

export type ArticleReadsIndex = ReadonlyMap<string, ArticleReadStats>;

export const indexArticleReads = (reads: ArticleReads | null): ArticleReadsIndex => new Map((reads?.articles ?? []).map(item => [item.articleId, item]));

const opensText = (count: number) => `${count.toLocaleString('ru-RU')} ${pluralRu(count, 'открытие', 'открытия', 'открытий')}`;
const readersText = (count: number) => `${count.toLocaleString('ru-RU')} ${pluralRu(count, 'человек', 'человека', 'человек')}`;

/** The «Читали» cell: the window first, the retained total as the detail. */
export function articleReadsCell(stats: ArticleReadStats | undefined, reads: ArticleReads | null): { label: string; detail: string } {
  if (!reads) return { label: '—', detail: 'нет данных о чтении' };
  if (!stats || !stats.opensTotal) return { label: 'не открывали', detail: '' };
  const total = `всего ${opensText(stats.opensTotal)}`;
  if (!stats.opens) return { label: `за ${reads.days} дней не открывали`, detail: `${total} · последнее ${formatContentDate(stats.lastOpenedAt)}` };
  return { label: `${opensText(stats.opens)} · ${readersText(stats.readers)}`, detail: stats.opensTotal > stats.opens ? total : '' };
}

/** Summary-line fragment; says since when opens are counted while the history is shorter than the window. */
export function articleReadsSummary(reads: ArticleReads | null, now: Date): string {
  if (!reads) return '';
  if (!reads.since) return 'открытия статей подписчиками начнут считаться с первого чтения';
  const base = `открытий за ${reads.days} дней: ${reads.totals.opens.toLocaleString('ru-RU')} (${readersText(reads.totals.readers)})`;
  const historyDays = (now.getTime() - new Date(reads.since).getTime()) / 86_400_000;
  return historyDays < reads.days ? `${base}, считаем с ${formatContentDate(reads.since)}` : base;
}

export type ArticleOrder = 'date' | 'reads';

/** `date` keeps the server order (newest first); `reads` puts the most opened articles of the window first. */
export function orderArticles(articles: Article[], order: ArticleOrder, index: ArticleReadsIndex): Article[] {
  if (order === 'date') return articles;
  const rank = (article: Article) => index.get(article.id);
  return articles
    .map((article, position) => ({ article, position }))
    .sort((left, right) => (rank(right.article)?.opens ?? 0) - (rank(left.article)?.opens ?? 0)
      || (rank(right.article)?.opensTotal ?? 0) - (rank(left.article)?.opensTotal ?? 0)
      || left.position - right.position)
    .map(item => item.article);
}

/** The order chips appear once at least one open has been recorded. */
export function articleOrderOptions(reads: ArticleReads | null): Array<{ id: ArticleOrder; label: string }> {
  if (!reads?.articles.some(item => item.opensTotal > 0)) return [];
  return [{ id: 'date', label: 'Сначала новые' }, { id: 'reads', label: 'Сначала читаемые' }];
}
