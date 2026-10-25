import { CirclePlay, Radio } from 'lucide-react';
import {
  STREAMER_CLASS_LABELS, STREAMER_FORMAT_LABELS, deckRankLabel, deckRecord, formatPlayedAt, streamerClassIcon, vodTimecode,
} from '../model/streamersView';
import type { StreamerDeck } from '../model/types';
import { CopyDeckCode } from './CopyDeckCode';

/** Русское имя архетипа; в полной строке ниже формат и имя HSGuru, в карточке они в подсказке. */
function DeckName({ deck, compact }: { deck: StreamerDeck; compact: boolean }) {
  const format = STREAMER_FORMAT_LABELS[deck.format];
  if (compact) return <span className="streamers-deck__name"><strong title={`${format} · ${deck.archetype}`}>{deck.archetypeLabel}</strong></span>;
  return <span className="streamers-deck__name">
    <strong title={deck.archetypeLabel}>{deck.archetypeLabel}</strong>
    <small>
      {format}
      {deck.archetypeLabel !== deck.archetype ? <> · <span lang="en">{deck.archetype}</span></> : null}
    </small>
  </span>;
}

/** Запись трансляции с моментом, когда колода была в игре: «Запись 5:41:20». */
function VodLink({ url }: { url: string }) {
  const time = vodTimecode(url);
  return <a href={url} target="_blank" rel="noopener noreferrer nofollow" title={time ? `Запись трансляции с ${time}` : 'Запись трансляции'}>
    <CirclePlay aria-hidden="true" /> Запись{time ? <small> {time}</small> : null}
  </a>;
}

/**
 * Колода стримера одной строкой: класс, русское имя архетипа (имя HSGuru
 * мелко), формат, пик Легенды, счёт, когда сыграна, запись и код.
 * `compact` — в карточке стримера: класс, архетип, пик и код, без счёта и записи.
 */
export function StreamerDeckRow({ deck, compact = false, streamUrl }: { deck: StreamerDeck; compact?: boolean; streamUrl?: string | null }) {
  const rank = deckRankLabel(deck);
  const record = compact ? null : deckRecord(deck);
  const className = deck.classKey ? STREAMER_CLASS_LABELS[deck.classKey] : null;
  return <li className="streamers-deck" data-compact={compact ? '' : undefined}>
    <img src={streamerClassIcon(deck.classKey)} alt={className ?? ''} width="28" height="28" loading="lazy" decoding="async" />
    <DeckName deck={deck} compact={compact} />
    <span className="streamers-deck__rank" title={rank ? 'Лучший ранг Легенды' : undefined}>{rank ?? '—'}</span>
    {compact ? null : <span className="streamers-deck__meta">
      <span className="streamers-deck__record">
        {record ? <>{record.text}{record.winrate !== null ? <small> · {record.winrate}%</small> : null}</> : '—'}
      </span>
      <time className="streamers-deck__played" dateTime={deck.lastPlayedAt}>{formatPlayedAt(deck.lastPlayedAt)}</time>
      <span className="streamers-deck__watch">
        {deck.onStream && streamUrl
          ? <a href={streamUrl} target="_blank" rel="noopener noreferrer nofollow" className="streamers-deck__live"><Radio aria-hidden="true" /> В эфире</a>
          : deck.vodUrl
            ? <VodLink url={deck.vodUrl} />
            : null}
      </span>
    </span>}
    <CopyDeckCode code={deck.code} label={deck.archetypeLabel} />
  </li>;
}
