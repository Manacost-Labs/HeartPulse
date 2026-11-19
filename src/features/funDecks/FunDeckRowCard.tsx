import { metaDistance, score } from '../FunDeckFacts';
import { CopyDeckButton, DeckLoadState, DeckPortrait, ManaCurve } from '../deckViews/deckViewParts';
import { WhyTags, useFunDeck, winRate, winRateTone, type DeckCardProps } from './funDeckCardParts';



export function FunDeckRowCard({ deck, fresh = false, tourAnchor = false, eager = false, pinnedTags = [] }: DeckCardProps) {
  const { data, error, reload, classMeta, entries, subtitle, ref } = useFunDeck(deck, eager);
  return (
    <article className="fun-deck-rowcard" ref={ref}>
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
        <CopyDeckButton deckCode={deck.deckCode} title={deck.title} className="fun-deck-rowcard__copy" />
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
