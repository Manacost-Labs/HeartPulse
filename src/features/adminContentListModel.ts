/**
 * Pure list logic for the admin «Статьи» and «Галерея» sections: filters, chip counts,
 * labels and draft checks. Contract: docs/specs/admin-crm.md, «Content lists».
 */
export type ArticleMode = 'arena' | 'battlegrounds' | 'standard' | 'wild' | 'general';

export type Article = {
  id: string;
  title: string;
  date: string;
  image?: string;
  excerpt?: string;
  tag?: string;
  mode?: ArticleMode;
  url?: string;
  likes?: number;
  dislikes?: number;
};

export type ArticleDraft = {
  title: string;
  tag: string;
  date: string;
  excerpt: string;
  mode: ArticleMode;
  image: string;
  url: string;
};

export const EMPTY_ARTICLE_DRAFT: ArticleDraft = { title: '', tag: '', date: '', excerpt: '', mode: 'arena', image: '', url: '' };

/** What a reader needs to open an article of each mode. */
export const ARTICLE_MODES: ReadonlyArray<{ id: ArticleMode; label: string; access: string }> = [
  { id: 'arena', label: 'Арена', access: 'подписка на статьи Арены' },
  { id: 'battlegrounds', label: 'Поля Сражений', access: 'подписка на статьи Полей Сражений' },
  { id: 'standard', label: 'Стандарт', access: 'план «Алмаз» и выше' },
  { id: 'wild', label: 'Вольный', access: 'план «Алмаз» и выше' },
  { id: 'general', label: 'Общий', access: 'любая подписка' },
];

export function articleMode(article: Pick<Article, 'mode'>) {
  return ARTICLE_MODES.find(mode => mode.id === article.mode) ?? ARTICLE_MODES[ARTICLE_MODES.length - 1];
}

export type ArticleIssue = 'no-excerpt' | 'no-link' | 'no-image';

const ISSUE_LABELS: Record<ArticleIssue, string> = {
  'no-excerpt': 'нет описания',
  'no-link': 'нет ссылки',
  'no-image': 'нет обложки',
};

const hasLink = (url?: string) => Boolean(url && url.trim() && url.trim() !== '#');

/** What is missing on the public card of this article. */
export function articleIssues(article: Pick<Article, 'excerpt' | 'url' | 'image'>): ArticleIssue[] {
  const issues: ArticleIssue[] = [];
  if (!article.excerpt?.trim()) issues.push('no-excerpt');
  if (!hasLink(article.url)) issues.push('no-link');
  if (!article.image?.trim()) issues.push('no-image');
  return issues;
}

export const articleIssueLabels = (article: Pick<Article, 'excerpt' | 'url' | 'image'>) => articleIssues(article).map(issue => ISSUE_LABELS[issue]);

export type ArticleModeFilter = 'all' | ArticleMode;
export type ArticleIssueFilter = 'all' | 'ready' | ArticleIssue;
type Chip<Id extends string> = { id: Id; label: string; count: number };

/** Mode chips: «Все» plus every mode that has at least one article. */
export function articleModeOptions(articles: Article[]): Chip<ArticleModeFilter>[] {
  const modes = ARTICLE_MODES
    .map(mode => ({ id: mode.id as ArticleModeFilter, label: mode.label, count: articles.filter(article => articleMode(article).id === mode.id).length }))
    .filter(option => option.count > 0);
  return [{ id: 'all', label: 'Все', count: articles.length }, ...modes];
}

/** Card-quality chips; empty when every article has a description, a link and a cover. */
export function articleIssueOptions(articles: Article[]): Chip<ArticleIssueFilter>[] {
  const counts: Record<ArticleIssue, number> = { 'no-excerpt': 0, 'no-link': 0, 'no-image': 0 };
  let ready = 0;
  for (const article of articles) {
    const issues = articleIssues(article);
    if (!issues.length) ready += 1;
    for (const issue of issues) counts[issue] += 1;
  }
  const issues: Chip<ArticleIssueFilter>[] = [
    { id: 'no-excerpt' as const, label: 'Без описания', count: counts['no-excerpt'] },
    { id: 'no-link' as const, label: 'Без ссылки', count: counts['no-link'] },
    { id: 'no-image' as const, label: 'Без обложки', count: counts['no-image'] },
  ].filter(option => option.count > 0);
  if (!issues.length) return [];
  return [{ id: 'all', label: 'Любая карточка', count: articles.length }, { id: 'ready', label: 'Заполнены', count: ready }, ...issues];
}

/** The selected chip, or `all` once that chip is gone: the last matching article was edited or deleted. */
export function activeChip<Id extends string>(options: ReadonlyArray<{ id: Id }>, selected: Id, fallback: Id): Id {
  return options.some(option => option.id === selected) ? selected : fallback;
}

export type ArticleFilters = { search: string; mode: ArticleModeFilter; issue: ArticleIssueFilter };

export function filterArticles(articles: Article[], filters: ArticleFilters): Article[] {
  const query = filters.search.trim().toLocaleLowerCase('ru');
  return articles.filter(article => {
    if (filters.mode !== 'all' && articleMode(article).id !== filters.mode) return false;
    const issues = articleIssues(article);
    if (filters.issue === 'ready' && issues.length) return false;
    if (filters.issue !== 'all' && filters.issue !== 'ready' && !issues.includes(filters.issue)) return false;
    if (!query) return true;
    return [article.title, article.tag, article.excerpt, article.url].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query);
  });
}

/** `2026-09-29` → `29.09.2026`; a full timestamp is shown as the administrator's local day. */
export function formatContentDate(value: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (day) return `${day[3]}.${day[2]}.${day[1]}`;
  const moment = value ? new Date(value) : null;
  if (!moment || !Number.isFinite(moment.getTime())) return value || '—';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(moment.getDate())}.${pad(moment.getMonth() + 1)}.${moment.getFullYear()}`;
}

/** Host for an external link, path for an internal one. */
export function articleLinkLabel(url?: string): string {
  if (!hasLink(url)) return 'ссылка не указана';
  const value = String(url).trim();
  if (value.startsWith('/')) return value;
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

export function articleVotesLabel(article: Pick<Article, 'likes' | 'dislikes'>): string {
  const likes = Number(article.likes || 0);
  const dislikes = Number(article.dislikes || 0);
  return likes || dislikes ? `${likes} за · ${dislikes} против` : 'оценок нет';
}

/** «Последняя публикация 29.09.2026 · за 30 дней: 8». */
export function articlePublishingSummary(articles: Article[], now: Date): string {
  const dates = articles.map(article => article.date).filter(date => /^\d{4}-\d{2}-\d{2}/.test(date || '')).sort();
  if (!dates.length) return '';
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const recent = dates.filter(date => date.slice(0, 10) >= since).length;
  return `последняя публикация ${formatContentDate(dates[dates.length - 1])} · за 30 дней: ${recent}`;
}

export function draftFromArticle(article: Article): ArticleDraft {
  return {
    title: article.title || '', tag: article.tag || '', date: article.date || '', excerpt: article.excerpt || '',
    mode: articleMode(article).id, image: article.image || '', url: article.url || '',
  };
}

/** The first problem that stops a draft from being saved, or an empty string. */
export function articleDraftError(draft: ArticleDraft): string {
  if (!draft.title.trim()) return 'Укажите название статьи.';
  const url = draft.url.trim();
  if (url && url !== '#' && !/^https?:\/\//i.test(url) && !(url.startsWith('/') && !url.startsWith('//'))) {
    return 'Ссылка должна начинаться с http://, https:// или с «/» для страницы сайта.';
  }
  return '';
}

export const isArticleDraftChanged = (draft: ArticleDraft, initial: ArticleDraft) => (Object.keys(initial) as Array<keyof ArticleDraft>)
  .some(key => draft[key] !== initial[key]);

/** Sections already used by other articles, most frequent first, for the «Раздел» suggestions. */
export function articleTagSuggestions(articles: Article[]): string[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    const tag = article.tag?.trim();
    if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru')).map(([tag]) => tag);
}

export type GalleryItem = {
  id: string;
  title: string;
  description?: string;
  tag?: string;
  source?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  previewUrl: string;
  thumbUrl: string;
  imageUrl: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt?: string;
};

export type GalleryDraft = { title: string; tag: string; description: string; source: string };

export const EMPTY_GALLERY_DRAFT: GalleryDraft = { title: '', tag: '', description: '', source: '' };

export function formatBytes(bytes?: number): string {
  const value = Number(bytes || 0);
  if (!value) return 'размер не указан';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  if (value >= 1024) return `${Math.round(value / 1024)} КБ`;
  return `${value} Б`;
}

/** `1920 × 1080 · 125 КБ · WEBP`, skipping what the server did not record. */
export function galleryFileLabel(item: Pick<GalleryItem, 'width' | 'height' | 'bytes' | 'format'>): string {
  return [
    item.width && item.height ? `${item.width} × ${item.height}` : '',
    formatBytes(item.bytes),
    item.format ? item.format.toUpperCase() : '',
  ].filter(Boolean).join(' · ');
}

export function filterGalleryItems(items: GalleryItem[], search: string): GalleryItem[] {
  const query = search.trim().toLocaleLowerCase('ru');
  if (!query) return items;
  return items.filter(item => [item.title, item.tag, item.description, item.source].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query));
}
