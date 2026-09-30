import React, { Suspense, useId, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { loadAdminSheet } from '../modules/adminCrm/public';
import {
  ARTICLE_MODES,
  EMPTY_ARTICLE_DRAFT,
  articleDraftError,
  articleMode,
  draftFromArticle,
  formatContentDate,
  isArticleDraftChanged,
  type Article,
  type ArticleDraft,
} from './adminContentListModel';
import { ContestAdminImageUploader } from './ContestAdminImageUploader';
import './adminContent.css';

const AdminSheet = React.lazy(loadAdminSheet);

export type AdminArticleEditorProps = {
  /** The article being edited, or `null` for a new one. */
  article: Article | null;
  tagSuggestions: string[];
  saving: boolean;
  /** Resolves to an error text, or to an empty string once the article is saved. */
  onSave: (draft: ArticleDraft) => Promise<string>;
  onClose: () => void;
};

/** The card as a reader sees it in the article list, built from the draft. */
function ArticlePreview({ draft }: { draft: ArticleDraft }) {
  return (
    <figure className="admin-content-preview">
      {draft.image
        ? <img src={draft.image} alt="" />
        : <span className="admin-content-preview-empty" aria-hidden="true"><BookOpen size={22} /></span>}
      <figcaption>
        <small>{[draft.tag.trim() || 'Без раздела', articleMode(draft).label, draft.date ? formatContentDate(draft.date) : 'сегодня'].join(' · ')}</small>
        <strong>{draft.title.trim() || 'Название статьи'}</strong>
        <span>{draft.excerpt.trim() || 'Описания нет: на карточке будет только название.'}</span>
      </figcaption>
    </figure>
  );
}

export function AdminArticleEditor({ article, tagSuggestions, saving, onSave, onClose }: AdminArticleEditorProps) {
  const fieldId = useId();
  const [initial] = useState<ArticleDraft>(() => (article ? draftFromArticle(article) : EMPTY_ARTICLE_DRAFT));
  const [draft, setDraft] = useState<ArticleDraft>(initial);
  const [error, setError] = useState('');
  const change = (patch: Partial<ArticleDraft>) => { setError(''); setDraft(current => ({ ...current, ...patch })); };

  const close = () => {
    if (saving) return;
    if (isArticleDraftChanged(draft, initial) && !window.confirm('Закрыть без сохранения? Изменения будут потеряны.')) return;
    onClose();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = articleDraftError(draft);
    setError(problem || await onSave(draft));
  };

  return (
    <Suspense fallback={null}>
      <AdminSheet
        title={article ? 'Редактирование статьи' : 'Новая статья'}
        description={article ? `ID ${article.id}` : 'Карточка появится в списке статей сразу после сохранения.'}
        closeLabel="Закрыть редактор статьи"
        busy={saving}
        initialFocus={article ? undefined : 'input'}
        onClose={close}
      >
        <form className="admin-content-form" onSubmit={event => void submit(event)} noValidate>
          <ArticlePreview draft={draft} />
          <label htmlFor={`${fieldId}-title`}>Название</label>
          <input id={`${fieldId}-title`} required value={draft.title} maxLength={180} onChange={event => change({ title: event.target.value })} />
          <label htmlFor={`${fieldId}-tag`}>Раздел</label>
          <input id={`${fieldId}-tag`} value={draft.tag} maxLength={120} list={`${fieldId}-tags`} placeholder="Гайд, Мета-отчет, Поля Сражений" onChange={event => change({ tag: event.target.value })} />
          <datalist id={`${fieldId}-tags`}>{tagSuggestions.map(tag => <option key={tag} value={tag} />)}</datalist>
          <label htmlFor={`${fieldId}-mode`}>Тип доступа</label>
          <select id={`${fieldId}-mode`} value={draft.mode} onChange={event => change({ mode: event.target.value as ArticleDraft['mode'] })}>
            {ARTICLE_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label} — {mode.access}</option>)}
          </select>
          <small>От типа зависит, какая подписка понадобится читателю.</small>
          <label htmlFor={`${fieldId}-excerpt`}>Краткое описание</label>
          <textarea id={`${fieldId}-excerpt`} rows={4} value={draft.excerpt} maxLength={4000} placeholder="Две-три фразы для карточки статьи" onChange={event => change({ excerpt: event.target.value })} />
          <label htmlFor={`${fieldId}-date`}>Дата публикации</label>
          <input id={`${fieldId}-date`} type="date" value={draft.date} onChange={event => change({ date: event.target.value })} />
          <small>Пустая дата сохранится как сегодняшняя.</small>
          <label htmlFor={`${fieldId}-url`}>Ссылка на статью</label>
          <input id={`${fieldId}-url`} value={draft.url} maxLength={2000} placeholder="https://…" onChange={event => change({ url: event.target.value })} />
          <ContestAdminImageUploader label="Картинка статьи" value={draft.image} onChange={image => change({ image })} />
          {error && <p className="admin-crm-error" role="alert">{error}</p>}
          <div className="admin-content-form-actions">
            <button type="submit" className="contest-primary-button" disabled={saving}>{saving ? 'Сохраняем…' : article ? 'Обновить статью' : 'Сохранить статью'}</button>
            <button type="button" className="contest-secondary-button" disabled={saving} onClick={close}>Отмена</button>
          </div>
        </form>
      </AdminSheet>
    </Suspense>
  );
}
