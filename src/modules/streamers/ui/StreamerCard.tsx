import {
  STREAMER_CLASS_LABELS, cardBestRank, distinctRecentDecks, favoriteClasses, formatFollowers, formatPlayedDay, ladderLabel, streamerClassIcon,
} from '../model/streamersView';
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

/** Строка под шапкой: любимые классы, место в таблице Blizzard и лучший ранг, если его нет в строках колод. */
function StreamerStats({ streamer, shown }: { streamer: StreamerSummary; shown: StreamerSummary['recentDecks'] }) {
  const classes = favoriteClasses(streamer.recentDecks);
  const ladder = ladderLabel(streamer.ladder);
  const best = cardBestRank(streamer.bestRank, shown);
  if (!classes.length && !ladder && !best) return null;
  return <p className="streamers-card__stats">
    {classes.length ? <span className="streamers-card__classes" role="img"
      aria-label={`Чаще играет: ${classes.map(classKey => STREAMER_CLASS_LABELS[classKey] ?? classKey).join(', ')}`}>
      {classes.map(classKey => <img key={classKey} src={streamerClassIcon(classKey)} alt="" width="20" height="20" loading="lazy" decoding="async"
        title={STREAMER_CLASS_LABELS[classKey]} />)}
    </span> : null}
    {ladder ? <span title={ladder.title}>место {ladder.text}</span> : null}
    {best ? <span title="Лучший ранг Легенды за 30 дней">лучший {best}</span> : null}
  </p>;
}

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
    <StreamerStats streamer={streamer} shown={decks} />
    {decks.length ? <ul className="streamers-decks" aria-label={`Последние колоды ${streamer.name}`}>
      {decks.map(deck => <StreamerDeckRow key={`${deck.deckId}-${deck.format}`} deck={deck} compact />)}
    </ul> : null}
  </li>;
}
