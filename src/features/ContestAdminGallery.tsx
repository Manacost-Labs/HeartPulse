import React from 'react';
import { Download, Image as ImageIcon, Trash2 } from 'lucide-react';
import { firstImageFile } from './ContestAdminImageUploader';
import { ADMIN_INPUT } from './contestAdminUi';

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

export type GalleryDraft = {
  title: string;
  tag: string;
  description: string;
  source: string;
};

type ContestAdminGalleryProps = {
  items: GalleryItem[];
  draft: GalleryDraft;
  file: File | null;
  uploading: boolean;
  deletingId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onDraftChange: (patch: Partial<GalleryDraft>) => void;
  onFileChange: (file: File | null) => void;
  onRefresh: () => void;
  onDelete: (item: GalleryItem) => void;
};

function formatBytes(bytes?: number): string {
  const value = Number(bytes || 0);
  if (!value) return 'размер не указан';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  if (value >= 1024) return `${Math.round(value / 1024)} КБ`;
  return `${value} Б`;
}

export function ContestAdminGallery({
  items,
  draft,
  file,
  uploading,
  deletingId,
  fileInputRef,
  onSubmit,
  onDraftChange,
  onFileChange,
  onRefresh,
  onDelete,
}: ContestAdminGalleryProps) {
  return (
    <div className="contest-admin-grid admin-gallery-layout">
      <form className="contest-admin-card admin-gallery-form" onSubmit={onSubmit} aria-busy={uploading}>
        <div className="admin-subsection-head">
          <div><h2>Новый арт</h2><p className="contest-muted">Оригинал сохранится для скачивания, а сайт сам создаст легкие превью.</p></div>
          <ImageIcon size={28} />
        </div>
        <label>Название
          <input value={draft.title} onChange={event => onDraftChange({ title: event.target.value })} placeholder="Например: Легенда Арены" style={ADMIN_INPUT} />
        </label>
        <label>Раздел
          <input value={draft.tag} onChange={event => onDraftChange({ tag: event.target.value })} placeholder="Арт, Обложка, Fan art" style={ADMIN_INPUT} />
        </label>
        <label>Описание
          <textarea value={draft.description} onChange={event => onDraftChange({ description: event.target.value })} rows={4} placeholder="Короткое описание для карточки" style={{ ...ADMIN_INPUT, resize: 'vertical' }} />
        </label>
        <label>Источник или автор
          <input value={draft.source} onChange={event => onDraftChange({ source: event.target.value })} placeholder="Необязательно" style={ADMIN_INPUT} />
        </label>
        <label className="admin-gallery-file">
          <span>{file ? file.name : 'Выберите изображение'}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={event => onFileChange(firstImageFile(event.target.files))}
          />
        </label>
        {file && (
          <div className="admin-gallery-selected">
            <ImageIcon size={18} />
            <span>{file.name}</span>
            <small>{formatBytes(file.size)}</small>
          </div>
        )}
        <button type="submit" disabled={uploading} className="contest-primary-button">
          {uploading ? 'Загружаем...' : 'Добавить в галерею'}
        </button>
      </form>

      <div className="contest-admin-card">
        <div className="admin-subsection-head">
          <div><h2>Загруженные арты</h2><p className="contest-muted">Публичный раздел `/gallery`, доступен всем пользователям.</p></div>
          <button type="button" className="contest-secondary-button" onClick={onRefresh}>Обновить</button>
        </div>
        <div className="admin-gallery-list">
          {items.map(item => (
            <article key={item.id} className="admin-gallery-row">
              <img src={item.thumbUrl || item.previewUrl} alt="" loading="lazy" decoding="async" />
              <div>
                <strong>{item.title}</strong>
                <small>{[item.tag || 'без раздела', item.width && item.height ? `${item.width} x ${item.height}` : '', formatBytes(item.bytes)].filter(Boolean).join(' · ')}</small>
                <span>{item.description || 'Описание не указано'}</span>
              </div>
              <div className="admin-gallery-actions">
                <a href={item.downloadUrl} title="Скачать оригинал" aria-label={`Скачать оригинал: ${item.title}`}><Download size={17} /></a>
                <button type="button" onClick={() => onDelete(item)} disabled={deletingId === item.id} title="Удалить" aria-label={`Удалить арт: ${item.title}`}>
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
          {!items.length && <p className="contest-muted" role="status">В галерее пока нет артов.</p>}
        </div>
      </div>
    </div>
  );
}
