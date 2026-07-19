import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { ContestAdminImageUploader } from './ContestAdminImageUploader';
import { ADMIN_INPUT } from './contestAdminUi';

export type Article = {
  id: string;
  title: string;
  date: string;
  image?: string;
  excerpt?: string;
  tag?: string;
  mode?: 'arena' | 'battlegrounds' | 'standard' | 'wild' | 'general';
  url?: string;
};

export type ArticleDraft = {
  title: string;
  tag: string;
  date: string;
  excerpt: string;
  mode: NonNullable<Article['mode']>;
  image: string;
  url: string;
};

type ContestAdminArticlesProps = {
  articles: Article[];
  visibleArticles: Article[];
  filteredCount: number;
  draft: ArticleDraft;
  editingId: string;
  loading: boolean;
  query: string;
  page: number;
  pageCount: number;
  formRef: React.RefObject<HTMLFormElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancelEdit: () => void;
  onDraftChange: (patch: Partial<ArticleDraft>) => void;
  onQueryChange: (query: string) => void;
  onEdit: (article: Article) => void;
  onDelete: (article: Article) => void;
  onPageChange: (page: number) => void;
};

function articleModeLabel(mode?: Article['mode']): string {
  if (mode === 'arena') return 'Арена';
  if (mode === 'battlegrounds') return 'Поля Сражений';
  if (mode === 'standard') return 'Стандарт';
  if (mode === 'wild') return 'Вольный';
  return 'Общий';
}

export function ContestAdminArticles({
  articles,
  visibleArticles,
  filteredCount,
  draft,
  editingId,
  loading,
  query,
  page,
  pageCount,
  formRef,
  listRef,
  onSubmit,
  onCancelEdit,
  onDraftChange,
  onQueryChange,
  onEdit,
  onDelete,
  onPageChange,
}: ContestAdminArticlesProps) {
  const changePage = (nextPage: number) => {
    onPageChange(nextPage);
    window.requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="contest-admin-grid admin-article-layout">
      <form ref={formRef} className="contest-admin-card admin-article-form" onSubmit={onSubmit}>
        <div className="admin-subsection-head">
          <div>
            <h2>{editingId ? 'Редактирование статьи' : 'Новая статья'}</h2>
            {editingId && <p className="contest-muted">ID: {editingId}</p>}
          </div>
          {editingId && <button type="button" className="contest-secondary-button" onClick={onCancelEdit}>Отменить</button>}
        </div>
        <label>Название<input required value={draft.title} onChange={event => onDraftChange({ title: event.target.value })} style={ADMIN_INPUT} /></label>
        <label>Раздел<input value={draft.tag} onChange={event => onDraftChange({ tag: event.target.value })} placeholder="Гайд, Мета, Поля Сражений" style={ADMIN_INPUT} /></label>
        <label>Тип доступа
          <select value={draft.mode} onChange={event => onDraftChange({ mode: event.target.value as ArticleDraft['mode'] })} style={ADMIN_INPUT}>
            <option value="arena">Арена — подписка на статьи Арены</option>
            <option value="battlegrounds">Поля Сражений — подписка на статьи БГ</option>
            <option value="standard">Стандарт — план «Алмаз» и выше</option>
            <option value="wild">Вольный — план «Алмаз» и выше</option>
            <option value="general">Общий материал</option>
          </select>
          <span className="admin-field-hint">Этот выбор определяет, какой доступ понадобится читателю.</span>
        </label>
        <label>Краткое описание
          <textarea value={draft.excerpt} onChange={event => onDraftChange({ excerpt: event.target.value })} rows={4} placeholder="Описание для карточки статьи" style={{ ...ADMIN_INPUT, resize: 'vertical' }} />
        </label>
        <label>Дата публикации
          <input type="date" value={draft.date} onChange={event => onDraftChange({ date: event.target.value })} style={ADMIN_INPUT} />
          <span className="admin-field-hint">Если оставить пустым, будет сохранена сегодняшняя дата.</span>
        </label>
        <label>Ссылка<input value={draft.url} onChange={event => onDraftChange({ url: event.target.value })} placeholder="https://..." style={ADMIN_INPUT} /></label>
        <ContestAdminImageUploader label="Картинка статьи" value={draft.image} onChange={image => onDraftChange({ image })} />
        <button type="submit" disabled={loading} className="contest-primary-button">
          {editingId ? 'Обновить статью' : 'Сохранить статью'}
        </button>
      </form>

      <div ref={listRef} className="contest-admin-card admin-article-list-card">
        <div className="admin-subsection-head">
          <div><h2>Список статей</h2><p className="contest-muted">Показано {visibleArticles.length} из {filteredCount}{filteredCount !== articles.length ? ` · всего ${articles.length}` : ''}</p></div>
        </div>
        <div className="admin-list-toolbar admin-page-toolbar">
          <label><span>Поиск по статьям</span><input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Название, раздел или описание" style={ADMIN_INPUT} /></label>
        </div>
        <div className="admin-article-list">
          {visibleArticles.map(article => (
            <div key={article.id} className="admin-article-row">
              {article.image ? <img src={article.image} alt="" /> : <div><BookOpen size={18} /></div>}
              <span><strong>{article.title}</strong><small>{article.tag || 'Без раздела'} · {article.date} · <b>{articleModeLabel(article.mode)}</b></small></span>
              <div className="admin-article-actions">
                {article.url && article.url !== '#' && <a href={article.url} target="_blank" rel="noreferrer" aria-label={`Открыть статью: ${article.title}`}><ExternalLink size={14} /> Просмотр</a>}
                <button type="button" onClick={() => onEdit(article)} disabled={loading}>Редактировать</button>
                <button type="button" className="admin-danger-button" onClick={() => onDelete(article)} disabled={loading}>Удалить</button>
              </div>
            </div>
          ))}
          {!filteredCount && <p className="contest-muted" role="status">{articles.length ? 'По вашему запросу ничего не найдено.' : 'Статей пока нет.'}</p>}
        </div>
        {pageCount > 1 && (
          <nav className="admin-pagination" aria-label="Страницы списка статей">
            <button type="button" disabled={page === 1} onClick={() => changePage(Math.max(1, page - 1))}>Назад</button>
            <span>Страница {page} из {pageCount}</span>
            <button type="button" disabled={page === pageCount} onClick={() => changePage(Math.min(pageCount, page + 1))}>Далее</button>
          </nav>
        )}
      </div>
    </div>
  );
}
