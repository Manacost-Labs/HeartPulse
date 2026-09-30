import React, { Suspense, useMemo, useRef, useState } from 'react';
import { Download, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { adminContentClient, type AdminContentClient } from './adminContentClient';
import { filterGalleryItems, formatContentDate, galleryFileLabel, type GalleryDraft, type GalleryItem } from './adminContentListModel';
import { fileToDataUrl } from './ContestAdminImageUploader';
import { AdminListPager } from './AdminListPager';
import { adminListCount } from './adminListText';
import type { AdminMessage } from './adminWorkspaceState';
import { useAdminContentList } from './useAdminContent';
import './adminPeople.css';
import './adminContent.css';

const AdminGalleryUpload = React.lazy(async () => ({ default: (await import('./AdminGalleryUpload')).AdminGalleryUpload }));
const PAGE_SIZE = 20;

type ContestAdminGalleryProps = {
  onMessage: (message: AdminMessage | null) => void;
  client?: AdminContentClient;
};

type RowProps = { item: GalleryItem; busy: boolean; onDelete: (item: GalleryItem) => void };

function GalleryRow({ item, busy, onDelete }: RowProps) {
  return (
    <tr className="admin-people-row admin-content-row">
      <td className="admin-people-cell-person">
        <div className="admin-people-person">
          <img className="admin-content-cover" src={item.thumbUrl || item.previewUrl} alt="" loading="lazy" decoding="async" />
          <div>
            <strong>{item.title}</strong>
            <small>{item.description || 'описание не указано'}</small>
            {item.source && <small>источник: {item.source}</small>}
          </div>
        </div>
      </td>
      <td data-label="Раздел"><span>{item.tag || 'без раздела'}</span></td>
      <td data-label="Файл"><span>{galleryFileLabel(item)}</span></td>
      <td data-label="Добавлен"><span>{formatContentDate(item.createdAt)}</span></td>
      <td className="admin-people-actions">
        <div className="admin-content-actions">
          <a href={item.downloadUrl} title="Скачать оригинал" aria-label={`Скачать оригинал: ${item.title}`}><Download size={16} aria-hidden="true" /></a>
          <button type="button" className="is-danger" title="Удалить" aria-label={`Удалить арт: ${item.title}`} disabled={busy} onClick={() => onDelete(item)}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </td>
    </tr>
  );
}

export function ContestAdminGallery({ onMessage, client = adminContentClient }: ContestAdminGalleryProps) {
  const list = useAdminContentList(client.gallery, onMessage);
  const [search, setSearch] = useState('');
  const [requestedPage, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const items = list.items;
  const filtered = useMemo(() => filterGalleryItems(items, search), [items, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const busy = Boolean(list.busy);

  const upload = async (draft: GalleryDraft, file: File) => {
    const failure = await list.run('upload', async () => client.uploadGalleryItem(draft, await fileToDataUrl(file)), 'Арт добавлен в галерею.', false);
    if (!failure) setUploadOpen(false);
    return failure;
  };
  const remove = (item: GalleryItem) => {
    if (!window.confirm(`Удалить «${item.title}» из галереи?`)) return;
    // The deleted row took the focus with it; the summary announces the new count.
    void list.run(`delete:${item.id}`, () => client.deleteGalleryItem(item.id), 'Арт удалён.').then(() => summaryRef.current?.focus());
  };

  return (
    <div className="admin-people admin-gallery-page">
      <div className="admin-people-toolbar">
        <label className="admin-people-search">
          <Search size={18} aria-hidden="true" />
          <span className="admin-crm-sr-only">Поиск по галерее</span>
          <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Название, раздел, описание или источник" />
        </label>
        <button type="button" className="contest-secondary-button admin-people-reload" disabled={list.loading || busy} onClick={() => void list.reload()}>
          <RefreshCw size={16} aria-hidden="true" /> Обновить
        </button>
        <button type="button" className="contest-primary-button admin-content-create" aria-haspopup="dialog" onClick={() => setUploadOpen(true)}>
          <Plus size={16} aria-hidden="true" /> Добавить арт
        </button>
      </div>
      {list.loadError && <div className="contest-message contest-message-err" role="alert">{list.loadError}</div>}
      <p ref={summaryRef} className="admin-people-summary" role="status" tabIndex={-1}>
        {list.loading ? 'Загружаем галерею…' : `${adminListCount(filtered.length, items.length, page, pageCount)} · публичный раздел /gallery, открыт всем`}
      </p>
      {visible.length ? (
        <div className="admin-people-table-wrap" aria-busy={busy}>
          <table className="admin-people-table is-gallery">
            <thead>
              <tr>
                <th scope="col">Арт</th><th scope="col">Раздел</th><th scope="col">Файл</th><th scope="col">Добавлен</th>
                <th scope="col"><span className="admin-crm-sr-only">Действия</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(item => <GalleryRow key={item.id} item={item} busy={busy} onDelete={remove} />)}
            </tbody>
          </table>
        </div>
      ) : !list.loading && !list.loadError && (
        <p className="admin-people-empty">{items.length ? 'Арты не найдены по текущему запросу.' : 'В галерее пока нет артов. Нажмите «Добавить арт».'}</p>
      )}
      <AdminListPager label="Страницы списка артов" page={page} pageCount={pageCount} onPage={setPage} />
      {uploadOpen && (
        <Suspense fallback={null}>
          <AdminGalleryUpload uploading={list.busy === 'upload'} onUpload={upload} onClose={() => setUploadOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
