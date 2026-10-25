'use client';

import { DEFAULT_STREAMERS_FILTERS, formatCount, plural } from '../model/streamersView';
import type { StreamersFilters as Filters, StreamersPage } from '../model/types';
import { LiveStreams } from './LiveStreams';
import { StreamerCard } from './StreamerCard';
import { StreamersToolbar } from './StreamersToolbar';
import { StreamerCardsSkeleton } from './StreamersSkeleton';
import './Streamers.css';

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

function isFiltered(filters: Filters): boolean {
  return Boolean(filters.format || filters.classKey || filters.language || filters.live || filters.query);
}

/** «Стримеры»: кто в эфире и каталог стримеров HSGuru, игравших за месяц. */
export function StreamersView({ page, live, loading, loadingMore, onFilters, onMore }: StreamersViewProps) {
  const total = formatCount(page.total) ?? '0';
  const { filters } = page;
  return <>
    <LiveStreams streams={live} russianOnly={filters.language === 'ru'} />
    <section className="streamers-section" aria-labelledby="streamers-catalog-title" aria-busy={loading || undefined}>
      <header className="streamers-section__heading">
        <h2 id="streamers-catalog-title">Стримеры и их колоды</h2>
        <p>{total} {plural(page.total, 'стример', 'стримера', 'стримеров')} с колодами на HSGuru за 30 дней.</p>
        <StreamersToolbar filters={filters} onChange={onFilters} />
      </header>
      {loading
        ? <StreamerCardsSkeleton />
        : page.streamers.length
          ? <ul className="streamers-cards">{page.streamers.map(streamer => <StreamerCard key={streamer.slug} streamer={streamer} />)}</ul>
          : <div className="streamers-empty">
            <p>{filters.query ? `Стримеров с ником «${filters.query}» не нашли.` : 'С такими фильтрами за месяц никто не играл.'}</p>
            {isFiltered(filters)
              ? <button type="button" className="streamers-chip" onClick={() => onFilters({ ...DEFAULT_STREAMERS_FILTERS, sort: filters.sort })}>Сбросить фильтры</button>
              : null}
          </div>}
      {!loading && page.streamers.length < page.total ? <div className="streamers-more">
        <button type="button" className="streamers-chip" onClick={onMore} disabled={loadingMore}>
          {loadingMore ? 'Загружаем…' : 'Показать ещё'}
        </button>
      </div> : null}
    </section>
  </>;
}
