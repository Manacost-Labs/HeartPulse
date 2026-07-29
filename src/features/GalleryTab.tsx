import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Image as ImageIcon, Maximize2, X } from 'lucide-react';
import { usePageScrollLock } from '../hooks/usePageScrollLock';
import { Breadcrumbs, SectionBanner } from './EditorialRouteChrome';
import '../route-parchment.css';
import './DeferredRoutes.css';

type GalleryItem = {
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

type GalleryData = {
  items: GalleryItem[];
  updatedAt: string | null;
};

function formatGalleryBytes(bytes?: number) {
  const value = Number(bytes || 0);
  if (!value) return '';
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  }
  if (value >= 1024) return `${Math.round(value / 1024)} КБ`;
  return `${value} Б`;
}

function formatGalleryDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function GalleryLightbox({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  usePageScrollLock(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={item.title}>
      <button
        type="button"
        className="gallery-lightbox-backdrop"
        onClick={onClose}
        aria-label="Закрыть"
      />
      <div className="gallery-lightbox-panel">
        <div className="gallery-lightbox-head">
          <div>
            <strong>{item.title}</strong>
            <span>
              {[
                item.width && item.height ? `${item.width} x ${item.height}` : '',
                formatGalleryBytes(item.bytes),
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div>
            <a href={item.downloadUrl} className="gallery-icon-action" title="Скачать оригинал">
              <Download size={18} aria-hidden="true" />
            </a>
            <button
              type="button"
              className="gallery-icon-action"
              onClick={onClose}
              title="Закрыть"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <img src={item.previewUrl || item.imageUrl} alt={item.title} decoding="async" />
        {(item.description || item.source) && (
          <div className="gallery-lightbox-caption">
            {item.description && <p>{item.description}</p>}
            {item.source && <span>{item.source}</span>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function GalleryTab({
  data,
  loading,
  onNavigate,
}: {
  data: GalleryData;
  loading: boolean;
  onNavigate: (tab: string) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const items = Array.isArray(data.items) ? data.items : [];

  return (
    <div className="gallery-page">
      <SectionBanner
        title="Галерея"
        subtitle="Арты Манакоста в высоком качестве для просмотра и скачивания"
      />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Галерея', href: '/gallery' },
      ]} />

      <section className="gallery-intro" aria-label="О галерее">
        <div>
          <span><ImageIcon size={18} aria-hidden="true" /> Публичный раздел</span>
          <h2>Просматривайте арты и скачивайте оригиналы</h2>
          <p>
            Доступ открыт для всех пользователей. На странице показываются
            облегченные превью, а полный файл скачивается только по кнопке.
          </p>
        </div>
        {data.updatedAt && (
          <time dateTime={data.updatedAt}>Обновлено: {formatGalleryDate(data.updatedAt)}</time>
        )}
      </section>

      {loading ? (
        <div className="gallery-grid">
          {[1, 2, 3, 4, 5, 6].map(item => (
            <div key={item} className="gallery-card gallery-card-skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="gallery-empty">
          <ImageIcon size={42} aria-hidden="true" />
          <strong>Арты скоро появятся</strong>
          <span>Когда администратор загрузит изображения, они будут доступны здесь.</span>
        </div>
      ) : (
        <div className="gallery-grid">
          {items.map(item => (
            <article key={item.id} className="gallery-card">
              <button
                type="button"
                className="gallery-card-image"
                onClick={() => setSelectedItem(item)}
                aria-label={`Открыть ${item.title}`}
              >
                <img
                  src={item.thumbUrl || item.previewUrl}
                  alt={item.title}
                  width={720}
                  height={518}
                  loading="lazy"
                  decoding="async"
                />
                <span><Maximize2 size={17} aria-hidden="true" /> Открыть</span>
              </button>
              <div className="gallery-card-body">
                <div>
                  {item.tag && <span className="gallery-tag">{item.tag}</span>}
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description}</p>}
                </div>
                <div className="gallery-card-meta">
                  <span>
                    {item.width && item.height
                      ? `${item.width} x ${item.height}`
                      : 'Высокое качество'}
                  </span>
                  <span>{formatGalleryBytes(item.bytes)}</span>
                </div>
                <a href={item.downloadUrl} className="gallery-download">
                  <Download size={17} aria-hidden="true" />
                  Скачать оригинал
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
      {selectedItem && (
        <GalleryLightbox item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
