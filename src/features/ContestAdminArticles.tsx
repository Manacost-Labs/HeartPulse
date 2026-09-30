import React, { Suspense, useMemo, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { AdminFilterChips } from '../modules/adminCrm/public';
import { adminContentClient, type AdminContentClient } from './adminContentClient';
import {
  activeChip,
  articleIssueLabels,
  articleIssueOptions,
  articleLinkLabel,
  articleMode,
  articleModeOptions,
  articlePublishingSummary,
  articleTagSuggestions,
  articleVotesLabel,
  filterArticles,
  formatContentDate,
  type Article,
  type ArticleDraft,
  type ArticleIssueFilter,
  type ArticleModeFilter,
} from './adminContentListModel';
import { AdminListPager } from './AdminListPager';
import { adminListCount } from './adminListText';
import type { AdminMessage } from './adminWorkspaceState';
import { useAdminContentList } from './useAdminContent';
import './adminPeople.css';
import './adminContent.css';

const AdminArticleEditor = React.lazy(async () => ({ default: (await import('./AdminArticleEditor')).AdminArticleEditor }));
const PAGE_SIZE = 20;

type ContestAdminArticlesProps = {
  onMessage: (message: AdminMessage | null) => void;
  client?: AdminContentClient;
};

type RowProps = {
  article: Article;
  busy: boolean;
  onEdit: (article: Article) => void;
  onDelete: (article: Article) => void;
};

function ArticleRow({ article, busy, onEdit, onDelete }: RowProps) {
  const mode = articleMode(article);
  const issues = articleIssueLabels(article);
  const opens = Boolean(article.url && article.url !== '#');
  return (
    <tr className="admin-people-row admin-content-row">
      <td className="admin-people-cell-person">
        <div className="admin-people-person">
          {article.image
            ? <img className="admin-content-cover" src={article.image} alt="" loading="lazy" decoding="async" />
            : <span className="admin-content-cover" aria-hidden="true"><BookOpen size={16} /></span>}
          <div>
            <button type="button" className="admin-crm-open" aria-haspopup="dialog" onClick={() => onEdit(article)}>{article.title}</button>
            <small>{articleLinkLabel(article.url)}</small>
            {issues.length > 0 && <small className="admin-content-issues">{issues.join(' · ')}</small>}
          </div>
        </div>
      </td>
      <td data-label="Раздел"><span>{article.tag || 'без раздела'}</span></td>
      <td data-label="Доступ">
        <span>{mode.label}</span>
        <small>{mode.access}</small>
      </td>
      <td data-label="Дата"><span>{formatContentDate(article.date)}</span></td>
      <td data-label="Оценки"><span>{articleVotesLabel(article)}</span></td>
      <td className="admin-people-actions">
        <div className="admin-content-actions">
          {opens && (
            <a href={article.url} target="_blank" rel="noreferrer" title="Открыть статью" aria-label={`Открыть статью: ${article.title}`}><ExternalLink size={16} aria-hidden="true" /></a>
          )}
          <button type="button" title="Изменить" aria-label={`Изменить статью: ${article.title}`} disabled={busy} onClick={() => onEdit(article)}><Pencil size={16} aria-hidden="true" /></button>
          <button type="button" className="is-danger" title="Удалить" aria-label={`Удалить статью: ${article.title}`} disabled={busy} onClick={() => onDelete(article)}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </td>
    </tr>
  );
}

export function ContestAdminArticles({ onMessage, client = adminContentClient }: ContestAdminArticlesProps) {
  const list = useAdminContentList(client.articles, onMessage);
  const [search, setSearch] = useState('');
  const [selectedMode, setMode] = useState<ArticleModeFilter>('all');
  const [selectedIssue, setIssue] = useState<ArticleIssueFilter>('all');
  const [requestedPage, setPage] = useState(1);
  // `null` closes the editor; an empty id opens it for a new article.
  const [editingId, setEditingId] = useState<string | null>(null);
  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const articles = list.items;
  const modeOptions = useMemo(() => articleModeOptions(articles), [articles]);
  const issueOptions = useMemo(() => articleIssueOptions(articles), [articles]);
  const mode = activeChip(modeOptions, selectedMode, 'all');
  const issue = activeChip(issueOptions, selectedIssue, 'all');
  const filtered = useMemo(() => filterArticles(articles, { search, mode, issue }), [articles, issue, mode, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Deleting the last row of the last page must not leave the list on a page that no longer exists.
  const page = Math.min(requestedPage, pageCount);
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const publishing = useMemo(() => articlePublishingSummary(articles, new Date()), [articles]);
  const tagSuggestions = useMemo(() => articleTagSuggestions(articles), [articles]);
  const editing = editingId ? articles.find(article => article.id === editingId) ?? null : null;
  const busy = Boolean(list.busy);

  const save = async (draft: ArticleDraft) => {
    const failure = await list.run('save', () => client.saveArticle(draft, editingId || ''), editingId ? 'Статья обновлена.' : 'Статья добавлена.', false);
    if (!failure) setEditingId(null);
    return failure;
  };
  const remove = (article: Article) => {
    if (!window.confirm(`Удалить «${article.title}»? Вместе со статьёй будут удалены её оценки. Это действие нельзя отменить.`)) return;
    // The deleted row took the focus with it; the summary announces the new count.
    void list.run(`delete:${article.id}`, () => client.deleteArticle(article.id), 'Статья удалена.').then(() => summaryRef.current?.focus());
  };
  const summary = list.loading
    ? 'Загружаем статьи…'
    : `${adminListCount(filtered.length, articles.length, page, pageCount)}${publishing ? ` · ${publishing}` : ''}`;

  return (
    <div className="admin-people admin-articles">
      <div className="admin-people-toolbar">
        <label className="admin-people-search">
          <Search size={18} aria-hidden="true" />
          <span className="admin-crm-sr-only">Поиск по статьям</span>
          <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Название, раздел, описание или ссылка" />
        </label>
        <button type="button" className="contest-secondary-button admin-people-reload" disabled={list.loading || busy} onClick={() => void list.reload()}>
          <RefreshCw size={16} aria-hidden="true" /> Обновить
        </button>
        <button type="button" className="contest-primary-button admin-content-create" aria-haspopup="dialog" onClick={() => setEditingId('')}>
          <Plus size={16} aria-hidden="true" /> Новая статья
        </button>
      </div>
      <div className="admin-crm-segments">
        <AdminFilterChips label="Режим статьи" options={modeOptions} value={mode} onChange={id => { setMode(id); setPage(1); }} />
        {issueOptions.length > 0 && (
          <AdminFilterChips label="Заполненность карточки" options={issueOptions} value={issue} onChange={id => { setIssue(id); setPage(1); }} secondary />
        )}
      </div>
      {list.loadError && <div className="contest-message contest-message-err" role="alert">{list.loadError}</div>}
      <p ref={summaryRef} className="admin-people-summary" role="status" tabIndex={-1}>{summary}</p>
      {visible.length ? (
        <div className="admin-people-table-wrap" aria-busy={busy}>
          <table className="admin-people-table is-articles">
            <thead>
              <tr>
                <th scope="col">Статья</th><th scope="col">Раздел</th><th scope="col">Доступ</th><th scope="col">Дата</th><th scope="col">Оценки</th>
                <th scope="col"><span className="admin-crm-sr-only">Действия</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(article => <ArticleRow key={article.id} article={article} busy={busy} onEdit={item => setEditingId(item.id)} onDelete={remove} />)}
            </tbody>
          </table>
        </div>
      ) : !list.loading && !list.loadError && (
        <p className="admin-people-empty">{articles.length ? 'Статьи не найдены по текущим фильтрам.' : 'Статей пока нет. Нажмите «Новая статья», чтобы добавить первую.'}</p>
      )}
      <AdminListPager label="Страницы списка статей" page={page} pageCount={pageCount} onPage={setPage} />
      {editingId !== null && (
        <Suspense fallback={null}>
          <AdminArticleEditor key={editingId} article={editing} tagSuggestions={tagSuggestions} saving={list.busy === 'save'} onSave={save} onClose={() => setEditingId(null)} />
        </Suspense>
      )}
    </div>
  );
}
