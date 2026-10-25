import { STREAMER_CLASS_LABELS, distinctRecentDecks, formatFollowers, formatPlayedDay } from '../model/streamersView';
import type { StreamerSummary } from '../model/types';
import { StreamerDeckRow } from './StreamerDeckRow';
import { StreamerLinks } from './StreamerLinks';

export function StreamerAvatar({ streamer, size }: { streamer: Pick<StreamerSummary, 'avatarUrl' | 'name'>; size: number }) {
  return streamer.avatarUrl
    ? <img className="streamers-avatar" src={streamer.avatarUrl} alt="" width={size} height={size} loading="lazy" decoding="async" />
    : <span className="streamers-avatar streamers-avatar--empty" style={{ width: size, height: size }} aria-hidden="true">
      {streamer.name.slice(0, 1).toUpperCase()}
    </span>;
}

const CARD_LINKS = new Set(['twitch', 'youtube']);

/** Карточка стримера: имя ведёт на его страницу, ссылки Twitch и YouTube, ниже три последние колоды. */
export function StreamerCard({ streamer }: { streamer: StreamerSummary }) {
  const followers = formatFollowers(streamer.followers);
  const lastDay = streamer.lastPlayedAt ? formatPlayedDay(streamer.lastPlayedAt) : null;
  const decks = distinctRecentDecks(streamer.recentDecks);
  return <li className="streamers-card">
    <div className="streamers-card__head">
      <StreamerAvatar streamer={streamer} size={44} />
      <div className="streamers-card__identity">
        <h3><a href={`/streamers/${streamer.slug}/`}>{streamer.name}</a></h3>
        <p>
          {streamer.live
            ? <a className="streamers-card__live" href={streamer.live.streamUrl} target="_blank" rel="noopener noreferrer nofollow">в эфире</a>
            : null}
          <span>{[followers, lastDay ? `играл ${lastDay}` : null].filter(Boolean).join(' · ')}</span>
        </p>
      </div>
      <StreamerLinks links={streamer.links.filter(link => CARD_LINKS.has(link.kind))} name={streamer.name} />
    </div>
    {decks.length ? <ul className="streamers-decks" aria-label={`Последние колоды ${streamer.name}`}>
      {decks.map(deck => <StreamerDeckRow key={`${deck.deckId}-${deck.format}`} deck={deck} compact />)}
    </ul> : null}
  </li>;
}

export const STREAMER_CLASS_OPTIONS = Object.entries(STREAMER_CLASS_LABELS).map(([value, label]) => ({ value, label }));
