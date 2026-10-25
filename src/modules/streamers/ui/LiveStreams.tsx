'use client';

import { useMemo, useState } from 'react';
import {
  LIVE_PREVIEW_COUNT, STREAMER_CLASS_LABELS, formatViewers, streamModeLabel, streamerClassIcon, visibleLiveStreams,
} from '../model/streamersView';
import type { LiveStream } from '../model/types';

function LiveStreamRow({ stream, eager }: { stream: LiveStream; eager: boolean }) {
  const facts = [formatViewers(stream.live.viewers), streamModeLabel(stream.live.mode)].filter(Boolean);
  const className = stream.deck?.classKey ? STREAMER_CLASS_LABELS[stream.deck.classKey] : null;
  return <li className="streamers-live__item">
    <a className="streamers-live__thumb" href={stream.live.streamUrl} target="_blank" rel="noopener noreferrer nofollow"
      aria-label={`Смотреть ${stream.name} на Twitch`} title={stream.live.title ?? undefined}>
      {stream.live.thumbnailUrl
        ? <img src={stream.live.thumbnailUrl} alt="" width="192" height="108" loading={eager ? 'eager' : 'lazy'} decoding="async" />
        : <span aria-hidden="true" />}
    </a>
    <p className="streamers-live__name">
      {stream.slug ? <a href={`/streamers/${stream.slug}/`}>{stream.name}</a> : <span>{stream.name}</span>}
    </p>
    <p className="streamers-live__facts">{facts.join(' · ')}</p>
    {stream.deck ? <p className="streamers-live__deck" title={stream.deck.archetype}>
      <img src={streamerClassIcon(stream.deck.classKey)} alt={className ?? ''} width="18" height="18" loading="lazy" decoding="async" />
      <span>{stream.deck.archetypeLabel}</span>
    </p> : null}
  </li>;
}

/** Кто сейчас стримит Hearthstone, по числу зрителей; колода — та, что сыграна в этом эфире. */
export function LiveStreams({ streams }: { streams: LiveStream[] }) {
  const [russianOnly, setRussianOnly] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasRussian = streams.some(stream => stream.language === 'ru');
  const visible = useMemo(() => visibleLiveStreams(streams, russianOnly), [streams, russianOnly]);
  const shown = expanded ? visible : visible.slice(0, LIVE_PREVIEW_COUNT);

  return <section className="streamers-section streamers-section--live" aria-labelledby="streamers-live-title">
    <header className="streamers-section__heading streamers-section__heading--row">
      <h2 id="streamers-live-title">Сейчас в эфире</h2>
      {hasRussian ? <div className="streamers-chips" role="group" aria-label="Язык трансляции">
        <button type="button" className="streamers-chip" aria-pressed={!russianOnly} onClick={() => setRussianOnly(false)}>Все</button>
        <button type="button" className="streamers-chip" aria-pressed={russianOnly} onClick={() => setRussianOnly(true)}>На русском</button>
      </div> : null}
      {visible.length > shown.length
        ? <button type="button" className="streamers-chip streamers-live__all" onClick={() => setExpanded(true)}>Показать все {visible.length}</button>
        : null}
    </header>
    {shown.length
      ? <ul className="streamers-live" aria-label="Трансляции Hearthstone по числу зрителей">
        {shown.map((stream, index) => <LiveStreamRow key={stream.login} stream={stream} eager={index < 4} />)}
      </ul>
      : <p className="streamers-empty">Сейчас никто не в эфире.</p>}
  </section>;
}
