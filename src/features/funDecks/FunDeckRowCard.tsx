import { useState } from 'react';
import { metaDistance, score } from '../FunDeckFacts';
import { funDeckCardArt, funDeckManaCurve, type FunDeckCard, type FunDeckEntry } from './deckEntries';
import { CardLink, CopyDeckButton, DeckLoadState, WhyTags, useFunDeck, winRate, winRateTone, type DeckCardProps } from './funDeckCardParts';

/** «Строки»: one deck per line with round card portraits and the mana curve. */
function DeckPortrait({ card, configuredCost = null, small = false, eager }: {
  card: FunDeckCard; configuredCost?: number | null; small?: boolean; eager: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const cost = configuredCost ?? card.cost;
  const rarity = (card.rarity || 'common').toLowerCase();
  return (
    <CardLink card={card} cost={cost} className={`fun-deck-portrait is-${rarity}${small ? ' is-small' : ''}`}>
      <span className="fun-deck-portrait__ring">
        {failed ? <b>{cost}</b> : (
          <img src={funDeckCardArt(card.id, 'portrait')} alt="" width={96} height={96}
            loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
        )}
      </span>
      {card.elite ? <span className="fun-deck-portrait__badge is-star" aria-hidden="true">★</span>
        : card.count > 1 ? <span className="fun-deck-portrait__badge" aria-hidden="true">×{card.count}</span> : null}
    </CardLink>
  );
}

function ManaCurve({ entries }: { entries: readonly FunDeckEntry[] }) {
  const curve = funDeckManaCurve(entries);
  const top = Math.max(1, ...curve);
  return (
    <div className="fun-deck-curve" role="img"
      aria-label={`Кривая маны: ${curve.map((count, cost) => `${cost < 7 ? cost : '7+'} — ${count}`).join(', ')}`}>
      {curve.map((count, cost) => (
        <span key={cost} className="fun-deck-curve__bar">
          <i style={{ height: `${count ? Math.max(6, Math.round((count / top) * 100)) : 0}%` }} />
          <small>{cost < 7 ? cost : '7+'}</small>
        </span>
      ))}
    </div>
  );
}

export function FunDeckRowCard({ deck, fresh = false, tourAnchor = false, eager = false, pinnedTags = [] }: DeckCardProps) {
  const { data, error, reload, classMeta, entries, subtitle } = useFunDeck(deck);
  return (
    <article className="fun-deck-rowcard">
      <header className="fun-deck-rowcard__top">
        <div className="fun-deck-rowcard__identity">
          <span className="fun-deck-rowcard__hero"><img src={classMeta.icon} alt="" width="40" height="40" loading="lazy" decoding="async" /></span>
          <div>
            <h2>{deck.title}</h2>
            <p>{subtitle}{fresh ? <strong>Новая</strong> : null}</p>
            <WhyTags deck={deck} pinnedTags={pinnedTags} className="fun-deck-rowcard__why" />
          </div>
        </div>
        <dl className="fun-deck-rowcard__stats" data-tour-id={tourAnchor ? 'fun-decks-card-metrics' : undefined}>
          <div className={winRateTone(deck)}><dt>Винрейт</dt><dd>{winRate(deck, 1)}</dd></div>
          <div><dt>Игры</dt><dd>{deck.games?.toLocaleString('ru-RU') ?? '—'}</dd></div>
          <div><dt>Не похожа на мету</dt><dd>{metaDistance(deck.maxMetaSimilarity)}</dd></div>
          <div><dt>Индекс фана</dt><dd>{score(deck.funScore)}</dd></div>
        </dl>
        <CopyDeckButton deck={deck} className="fun-deck-rowcard__copy" />
      </header>
      <div className="fun-deck-rowcard__deck" data-tour-id={tourAnchor ? 'fun-decks-deck-list' : undefined}>
        {data?.cards.length ? (
          <>
            <ul className="fun-deck-rowcard__cards" role="list" aria-label={`Состав колоды ${deck.title}`}>
              {entries.map(entry => (
                <li key={entry.card.dbfId} className={entry.sideboard.length ? 'is-group' : undefined}
                  title={entry.sideboardLabel ?? undefined}>
                  <DeckPortrait card={entry.card} configuredCost={entry.configuredCost} eager={eager} />
                  {entry.sideboard.map(card => <DeckPortrait key={card.dbfId} card={card} small eager={eager} />)}
                </li>
              ))}
            </ul>
            <ManaCurve entries={entries} />
          </>
        ) : <DeckLoadState error={error} reload={reload} layout="rows" empty={Boolean(data)} />}
      </div>
    </article>
  );
}
