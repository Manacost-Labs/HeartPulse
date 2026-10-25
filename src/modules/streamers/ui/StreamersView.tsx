'use client';

import { Users } from 'lucide-react';
import { STREAMER_FORMAT_LABELS, formatCount, plural } from '../model/streamersView';
import type { StreamerFilters as Filters, StreamersPage } from '../model/types';
import { LiveStreams } from './LiveStreams';
import { STREAMER_CLASS_OPTIONS, StreamerCard } from './StreamerCard';
import { StreamerFilters } from './StreamerFilters';
import { StreamerCardsSkeleton } from './StreamersSkeleton';
import './Streamers.css';

const FORMAT_OPTIONS = (['standard', 'wild'] as const).map(value => ({ value, label: STREAMER_FORMAT_LABELS[value] }));

export type StreamersViewProps = {
  page: StreamersPage;
  /** Эфиры из первого ответа: фильтры каталога их не меняют. */
  live: StreamersPage['live'];
  /** Идёт загрузка нового фильтра. */
  loading: boolean;
  loadingMore: boolean;
  onFilters: (filters: Filters) => void;
  onMore: () => void;
};

/** «Стримеры»: кто в эфире и каталог стримеров HSGuru, игравших за месяц. */
export function StreamersView({ page, live, loading, loadingMore, onFilters, onMore }: StreamersViewProps) {
  const total = formatCount(page.total) ?? '0';
  return <>
    <LiveStreams streams={live} />
    <section className="streamers-section" aria-labelledby="streamers-catalog-title" aria-busy={loading || undefined}>
      <header className="streamers-section__heading">
        <span className="streamers-section__eyebrow"><Users aria-hidden="true" /> За 30 дней</span>
        <h2 id="streamers-catalog-title">Стримеры и их колоды</h2>
        <p>{total} {plural(page.total, 'стример', 'стримера', 'стримеров')} с колодами на HSGuru: ссылки на каналы и последние колоды с кодом.</p>
        <StreamerFilters filters={page.filters} formats={FORMAT_OPTIONS} classes={STREAMER_CLASS_OPTIONS} onChange={onFilters} />
      </header>
      {loading
        ? <StreamerCardsSkeleton />
        : page.streamers.length
          ? <ul className="streamers-cards">{page.streamers.map(streamer => <StreamerCard key={streamer.slug} streamer={streamer} />)}</ul>
          : <p className="streamers-empty">С такими колодами за месяц никто не играл.</p>}
      {!loading && page.streamers.length < page.total ? <div className="streamers-more">
        <button type="button" className="streamers-chip" onClick={onMore} disabled={loadingMore}>
          {loadingMore ? 'Загружаем…' : 'Показать ещё'}
        </button>
      </div> : null}
    </section>
  </>;
}
