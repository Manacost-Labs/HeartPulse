import React, { Suspense, useId, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { loadAdminSheet } from '../modules/adminCrm/public';
import { EMPTY_GALLERY_DRAFT, formatBytes, type GalleryDraft } from './adminContentListModel';
import { firstImageFile } from './ContestAdminImageUploader';
import './adminContent.css';

const AdminSheet = React.lazy(loadAdminSheet);

export type AdminGalleryUploadProps = {
  uploading: boolean;
  /** Resolves to an error text, or to an empty string once the art is stored. */
  onUpload: (draft: GalleryDraft, file: File) => Promise<string>;
  onClose: () => void;
};

export function AdminGalleryUpload({ uploading, onUpload, onClose }: AdminGalleryUploadProps) {
  const fieldId = useId();
  const [draft, setDraft] = useState<GalleryDraft>(EMPTY_GALLERY_DRAFT);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const change = (patch: Partial<GalleryDraft>) => { setError(''); setDraft(current => ({ ...current, ...patch })); };
  const started = Boolean(file) || Object.values(draft).some(value => value.trim());

  const close = () => {
    if (uploading) return;
    if (started && !window.confirm('Закрыть без загрузки? Заполненные поля будут потеряны.')) return;
    onClose();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return setError('Укажите название арта.');
    if (!file) return setError('Выберите файл изображения.');
    return setError(await onUpload(draft, file));
  };

  return (
    <Suspense fallback={null}>
      <AdminSheet
        title="Новый арт"
        description="Оригинал сохранится для скачивания, а сайт сам создаст лёгкие превью."
        closeLabel="Закрыть загрузку арта"
        busy={uploading}
        initialFocus="input"
        onClose={close}
      >
        <form className="admin-content-form" onSubmit={event => void submit(event)} noValidate>
          <label htmlFor={`${fieldId}-title`}>Название</label>
          <input id={`${fieldId}-title`} required value={draft.title} placeholder="Например: Легенда Арены" onChange={event => change({ title: event.target.value })} />
          <label htmlFor={`${fieldId}-tag`}>Раздел</label>
          <input id={`${fieldId}-tag`} value={draft.tag} placeholder="Арт, Обложка, Fan art" onChange={event => change({ tag: event.target.value })} />
          <label htmlFor={`${fieldId}-description`}>Описание</label>
          <textarea id={`${fieldId}-description`} rows={4} value={draft.description} placeholder="Короткое описание для карточки" onChange={event => change({ description: event.target.value })} />
          <label htmlFor={`${fieldId}-source`}>Источник или автор</label>
          <input id={`${fieldId}-source`} value={draft.source} placeholder="Необязательно" onChange={event => change({ source: event.target.value })} />
          <label htmlFor={`${fieldId}-file`}>Файл изображения</label>
          <input
            id={`${fieldId}-file`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={event => { setError(''); setFile(firstImageFile(event.target.files)); }}
          />
          {file && (
            <p className="admin-content-file" role="status"><ImageIcon size={16} aria-hidden="true" /> {file.name} <small>{formatBytes(file.size)}</small></p>
          )}
          {error && <p className="admin-crm-error" role="alert">{error}</p>}
          <div className="admin-content-form-actions">
            <button type="submit" className="contest-primary-button" disabled={uploading}>{uploading ? 'Загружаем…' : 'Добавить в галерею'}</button>
            <button type="button" className="contest-secondary-button" disabled={uploading} onClick={close}>Отмена</button>
          </div>
        </form>
      </AdminSheet>
    </Suspense>
  );
}
