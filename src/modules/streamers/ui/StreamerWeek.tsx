import { STREAMER_CLASS_LABELS, STREAMER_FORMAT_LABELS, deckRecord, formatCount, plural, streamerClassIcon } from '../model/streamersView';
import type { StreamerWeek as Week } from '../model/types';

/** «За 7 дней»: сколько колод и с каким счётом, и до четырёх самых сыгранных архетипов. */
export function StreamerWeek({ week }: { week: Week }) {
  const total = deckRecord(week);
  return <section className="streamers-section" aria-labelledby="streamer-week-title">
    <header className="streamers-section__heading streamers-section__heading--row">
      <h2 id="streamer-week-title">За 7 дней</h2>
      {week.decks ? <p className="streamers-week__total" title="Счёт — все игры этих колод на HSGuru">
        {formatCount(week.decks)} {plural(week.decks, 'колода', 'колоды', 'колод')}
        {total && (week.wins || week.losses) ? <> · {total.text}{total.winrate !== null ? ` · ${total.winrate}% побед` : ''}</> : null}
      </p> : null}
    </header>
    {week.archetypes.length
      ? <ul className="streamers-week" aria-label="Самые сыгранные архетипы недели">
        {week.archetypes.map(item => {
          const record = deckRecord(item);
          return <li key={`${item.format}|${item.archetype}`} className="streamers-week__item">
            <img src={streamerClassIcon(item.classKey)} alt={item.classKey ? STREAMER_CLASS_LABELS[item.classKey] ?? '' : ''}
              width="28" height="28" loading="lazy" decoding="async" />
            <span className="streamers-deck__name">
              <strong title={item.archetype}>{item.archetypeLabel}</strong>
              <small>{STREAMER_FORMAT_LABELS[item.format]} · {formatCount(item.decks)} {plural(item.decks, 'колода', 'колоды', 'колод')}</small>
            </span>
            <span className="streamers-week__record">
              {record && (item.wins || item.losses) ? <>{record.text}{record.winrate !== null ? <small> · {record.winrate}%</small> : null}</> : '—'}
            </span>
          </li>;
        })}
      </ul>
      : <p className="streamers-empty">За неделю колод на HSGuru нет.</p>}
  </section>;
}
