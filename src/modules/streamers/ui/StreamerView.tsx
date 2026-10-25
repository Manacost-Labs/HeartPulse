'use client';

import { useMemo } from 'react';
import { ChevronLeft, Radio } from 'lucide-react';
import {
  formatCount, formatFollowers, formatLiveSince, formatViewers, ladderLabel, plural, streamModeLabel, streamerFacetOptions,
} from '../model/streamersView';
import type { StreamerFilters as Filters, StreamerPage } from '../model/types';
import { StreamerAvatar } from './StreamerCard';
import { StreamerDeckRow } from './StreamerDeckRow';
import { StreamerFilters } from './StreamerFilters';
import { StreamerLinks } from './StreamerLinks';
import { StreamerDecksSkeleton } from './StreamersSkeleton';
import { StreamerWeek } from './StreamerWeek';
import './Streamers.css';

export type StreamerViewProps = {
  page: StreamerPage;
  loading: boolean;
  loadingMore: boolean;
  onFilters: (filters: Filters) => void;
  onMore: () => void;
};

function StreamerHeader({ page }: { page: StreamerPage }) {
  const { streamer } = page;
  const live = streamer.live;
  const ladder = ladderLabel(streamer.ladder);
  const facts = [formatFollowers(streamer.followers), `${formatCount(streamer.decksTotal)} ${plural(streamer.decksTotal, 'колода', 'колоды', 'колод')} на HSGuru`];
  return <header className="streamers-profile">
    <StreamerAvatar streamer={streamer} size={88} />
    <div className="streamers-profile__identity">
      <h1>{streamer.name}</h1>
      <p className="streamers-profile__facts">
        {facts.filter(Boolean).join(' · ')}
        {ladder ? <> · <span title={ladder.title}>таблица лидеров {ladder.text}</span></> : null}
      </p>
      <StreamerLinks links={streamer.links} name={streamer.name} />
    </div>
    {live ? <a className="streamers-profile__live" href={live.streamUrl} target="_blank" rel="noopener noreferrer nofollow"
      aria-label={`Смотреть ${streamer.name} на Twitch`}>
      {live.thumbnailUrl ? <img className="streamers-profile__thumb" src={live.thumbnailUrl} alt="" width="160" height="90" decoding="async" /> : null}
      <span className="streamers-profile__live-text">
        <span className="streamers-badge"><Radio aria-hidden="true" /> В эфире</span>
        {live.title ? <strong>{live.title}</strong> : null}
        <small>{[formatViewers(live.viewers), streamModeLabel(live.mode), formatLiveSince(live.startedAt)].filter(Boolean).join(' · ')}</small>
      </span>
    </a> : null}
  </header>;
}

/** Страница стримера: шапка с каналами и эфиром, колоды с фильтрами по формату и классу. */
export function StreamerView({ page, loading, loadingMore, onFilters, onMore }: StreamerViewProps) {
  const options = useMemo(() => streamerFacetOptions(page.streamer.facets, page.filters), [page.streamer.facets, page.filters]);
  const classes = options.classes.map(option => ({ value: option.value, label: `${option.label} · ${option.decks}` }));
  return <>
    <nav className="streamers-breadcrumbs" aria-label="Навигация">
      <a href="/streamers/"><ChevronLeft aria-hidden="true" /> Стримеры</a>
    </nav>
    <StreamerHeader page={page} />
    {page.week ? <StreamerWeek week={page.week} /> : null}
    <section className="streamers-section" aria-labelledby="streamer-decks-title" aria-busy={loading || undefined}>
      <header className="streamers-section__heading">
        <h2 id="streamer-decks-title">Колоды</h2>
        <p>Новые игры сверху. Ранг — лучший ранг Легенды с колодой, «Запись» открывает трансляцию в момент игры.</p>
        <StreamerFilters filters={page.filters} formats={options.formats} classes={classes} onChange={onFilters} />
      </header>
      {loading
        ? <StreamerDecksSkeleton />
        : page.decks.length
          ? <ul className="streamers-decks streamers-decks--full">
            {page.decks.map(deck => <StreamerDeckRow key={`${deck.deckId}-${deck.format}`} deck={deck} streamUrl={page.streamer.live?.streamUrl} />)}
          </ul>
          : <p className="streamers-empty">С такими фильтрами колод нет.</p>}
      {!loading && page.decks.length < page.total ? <div className="streamers-more">
        <button type="button" className="streamers-chip" onClick={onMore} disabled={loadingMore}>
          {loadingMore ? 'Загружаем…' : 'Показать ещё'}
        </button>
      </div> : null}
    </section>
  </>;
}
