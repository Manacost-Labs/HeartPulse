'use client';

import { useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { LIVE_PREVIEW_COUNT, formatLiveSince, formatViewers, streamModeLabel, visibleLiveStreams } from '../model/streamersView';
import type { LiveStream } from '../model/types';
import { StreamerDeckRow } from './StreamerDeckRow';

function LiveStreamRow({ stream, eager }: { stream: LiveStream; eager: boolean }) {
  const mode = streamModeLabel(stream.live.mode);
  const facts = [formatViewers(stream.live.viewers), mode, formatLiveSince(stream.live.startedAt)].filter(Boolean);
  return <li className="streamers-live__item">
    <a className="streamers-live__thumb" href={stream.live.streamUrl} target="_blank" rel="noopener noreferrer nofollow"
      aria-label={`Смотреть ${stream.name} на Twitch`}>
      {stream.live.thumbnailUrl
        ? <img src={stream.live.thumbnailUrl} alt="" width="160" height="90" loading={eager ? 'eager' : 'lazy'} decoding="async" />
        : <span aria-hidden="true" />}
    </a>
    <div className="streamers-live__text">
      <p className="streamers-live__name">
        {stream.slug ? <a href={`/streamers/${stream.slug}/`}>{stream.name}</a> : <span>{stream.name}</span>}
      </p>
      {stream.live.title ? <p className="streamers-live__title" title={stream.live.title}>{stream.live.title}</p> : null}
      <p className="streamers-live__facts">{facts.join(' · ')}</p>
    </div>
    {stream.deck ? <ul className="streamers-decks streamers-live__deck">
      <StreamerDeckRow deck={stream.deck} compact />
    </ul> : null}
  </li>;
}

/** Кто сейчас стримит Hearthstone, по числу зрителей; колода — та, что сыграна в этом эфире. */
export function LiveStreams({ streams }: { streams: LiveStream[] }) {
  const [russianOnly, setRussianOnly] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasRussian = streams.some(stream => stream.language === 'ru');
  const visible = useMemo(() => visibleLiveStreams(streams, russianOnly), [streams, russianOnly]);
  const shown = expanded ? visible : visible.slice(0, LIVE_PREVIEW_COUNT);

  return <section className="streamers-section" aria-labelledby="streamers-live-title">
    <header className="streamers-section__heading">
      <span className="streamers-section__eyebrow"><Radio aria-hidden="true" /> Twitch</span>
      <h2 id="streamers-live-title">Сейчас в эфире</h2>
      <p>Трансляции Hearthstone по числу зрителей. Колода — последняя, сыгранная в этом эфире.</p>
      {hasRussian ? <div className="streamers-chips" role="group" aria-label="Язык трансляции">
        <button type="button" className="streamers-chip" aria-pressed={!russianOnly} onClick={() => setRussianOnly(false)}>Все</button>
        <button type="button" className="streamers-chip" aria-pressed={russianOnly} onClick={() => setRussianOnly(true)}>На русском</button>
      </div> : null}
    </header>
    {shown.length
      ? <ul className="streamers-live">{shown.map((stream, index) => <LiveStreamRow key={stream.login} stream={stream} eager={index < 2} />)}</ul>
      : <p className="streamers-empty">Сейчас никто не в эфире.</p>}
    {visible.length > shown.length ? <div className="streamers-more">
      <button type="button" className="streamers-chip" onClick={() => setExpanded(true)}>Показать все {visible.length}</button>
    </div> : null}
  </section>;
}
