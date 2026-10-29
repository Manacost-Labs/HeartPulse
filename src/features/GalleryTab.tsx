import React, { useMemo, useState } from 'react';
import { Download, Image as ImageIcon, Maximize2 } from 'lucide-react';
import MediaLightbox, { type MediaLightboxItem } from '../components/ModalSurface/MediaLightbox';
import { Breadcrumbs, SectionBanner } from './EditorialRouteChrome';
import '../route-parchment.css';
import './TraditionalModeBanner.css';
import './DeferredRoutes.css';
import { GallerySkeleton } from './GallerySkeleton';

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

export default function GalleryTab({
  data,
  loading,
  onNavigate,
}: {
  data: GalleryData;
  loading: boolean;
  onNavigate: (tab: string) => void;
}) {
  const [selected, setSelected] = useState(-1);
  const items = useMemo(() => (Array.isArray(data.items) ? data.items : []), [data.items]);
  // The lightbox pages through every art of the list, in the order of the tiles.
  const lightboxItems = useMemo<MediaLightboxItem[]>(() => items.map(item => ({
    id: item.id,
    src: item.previewUrl || item.imageUrl,
    thumb: item.thumbUrl || item.previewUrl,
    alt: item.title,
    title: item.title,
    description: item.description,
    meta: [item.width && item.height ? `${item.width} x ${item.height}` : '', formatGalleryBytes(item.bytes), item.source].filter(Boolean).join(' · '),
  })), [items]);

  return (
    <div className="gallery-page">
      <SectionBanner
        title="Галерея"
        subtitle="Арты Манакоста в высоком качестве для просмотра и скачивания"
      />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Галерея', href: '/gallery/' },
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
        <GallerySkeleton />
      ) : items.length === 0 ? (
        <div className="gallery-empty">
          <ImageIcon size={42} aria-hidden="true" />
          <strong>Арты скоро появятся</strong>
          <span>Когда администратор загрузит изображения, они будут доступны здесь.</span>
        </div>
      ) : (
        <div className="gallery-grid">
          {items.map((item, position) => (
            <article key={item.id} className="gallery-card">
              <button
                type="button"
                className="gallery-card-image"
                data-lightbox-src={item.previewUrl || item.imageUrl}
                onClick={() => setSelected(position)}
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
      {selected >= 0 && items[selected] && (
        <MediaLightbox
          items={lightboxItems}
          index={selected}
          onClose={() => setSelected(-1)}
          onIndexChange={setSelected}
          actions={(
            <a href={items[selected].downloadUrl} className="media-lightbox__action" aria-label="Скачать оригинал">
              <Download size={18} aria-hidden="true" /> Скачать
            </a>
          )}
        />
      )}
    </div>
  );
}
