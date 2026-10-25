import { CirclePlay, Radio } from 'lucide-react';
import {
  STREAMER_CLASS_LABELS, STREAMER_FORMAT_LABELS, deckRankLabel, deckRecord, formatPlayedAt, streamerClassIcon,
} from '../model/streamersView';
import type { StreamerDeck } from '../model/types';
import { CopyDeckCode } from './CopyDeckCode';

/**
 * Колода стримера одной строкой: класс, русское имя архетипа (имя HSGuru
 * мелко), формат, пик Легенды, счёт, когда сыграна, запись и код.
 * `compact` — в карточке стримера: без счёта и записи.
 */
export function StreamerDeckRow({ deck, compact = false, streamUrl }: { deck: StreamerDeck; compact?: boolean; streamUrl?: string | null }) {
  const rank = deckRankLabel(deck);
  const record = compact ? null : deckRecord(deck);
  const className = deck.classKey ? STREAMER_CLASS_LABELS[deck.classKey] : null;
  return <li className="streamers-deck" data-compact={compact ? '' : undefined}>
    <img src={streamerClassIcon(deck.classKey)} alt={className ?? ''} width="28" height="28" loading="lazy" decoding="async" />
    <span className="streamers-deck__name">
      <strong title={deck.archetypeLabel}>{deck.archetypeLabel}</strong>
      <small>
        {STREAMER_FORMAT_LABELS[deck.format]}
        {deck.archetypeLabel !== deck.archetype ? <> · <span lang="en">{deck.archetype}</span></> : null}
      </small>
    </span>
    <span className="streamers-deck__rank" title={rank ? 'Лучший ранг Легенды' : undefined}>{rank ?? '—'}</span>
    {compact ? null : <>
      <span className="streamers-deck__record">
        {record ? <>{record.text}{record.winrate !== null ? <small> · {record.winrate}%</small> : null}</> : '—'}
      </span>
      <time className="streamers-deck__played" dateTime={deck.lastPlayedAt}>{formatPlayedAt(deck.lastPlayedAt)}</time>
      <span className="streamers-deck__watch">
        {deck.onStream && streamUrl
          ? <a href={streamUrl} target="_blank" rel="noopener noreferrer nofollow" className="streamers-deck__live"><Radio aria-hidden="true" /> В эфире</a>
          : deck.vodUrl
            ? <a href={deck.vodUrl} target="_blank" rel="noopener noreferrer nofollow"><CirclePlay aria-hidden="true" /> Запись</a>
            : null}
      </span>
    </>}
    <CopyDeckCode code={deck.code} label={deck.archetypeLabel} />
  </li>;
}
