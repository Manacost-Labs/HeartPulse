import { metaDistance, score } from '../FunDeckFacts';
import { CopyDeckButton, DeckCodeLine, DeckLoadState, TileEntry } from '../deckViews/deckViewParts';
import { funDeckDataDate } from './deckMeta';
import { WhyTags, useFunDeck, winRate, winRateTone, type DeckCardProps } from './funDeckCardParts';

/**
 * «Плитки», the page's default view and its server HTML: one card for every
 * viewer, a guest and a robot included. Everything on it is the open answer's
 * (the selection is open), so it has no lock.
 */
export function FunDeckTilesCard({ deck, fresh = false, tourAnchor = false, eager = false, pinnedTags = [] }: DeckCardProps) {
  const { data, error, reload, classMeta, entries, subtitle, ref } = useFunDeck(deck, eager);
  const date = funDeckDataDate(deck);
  return (
    <article className="fun-deck-tiles" ref={ref}>
      <header className="fun-deck-tiles__head">
        <img src={classMeta.icon} alt="" width="34" height="34" loading="lazy" decoding="async" />
        <div>
          <h2 title={deck.title}>{deck.title}</h2>
          <p><span>{subtitle}</span>{fresh ? <strong>Новая</strong> : null}</p>
        </div>
      </header>
      <dl className="fun-deck-tiles__stats fun-deck-tiles__stats--pairs" data-tour-id={tourAnchor ? 'fun-decks-card-metrics' : undefined}>
        <div className={winRateTone(deck)}><dt>Винрейт</dt><dd>{winRate(deck, 1)}</dd></div>
        <div><dt>Игры</dt><dd>{deck.games?.toLocaleString('ru-RU') ?? '—'}</dd></div>
        <div><dt>Фан</dt><dd>{score(deck.funScore)}</dd></div>
        <div><dt title="Не похожа на мету">Вне меты</dt><dd>{metaDistance(deck.maxMetaSimilarity)}</dd></div>
      </dl>
      <WhyTags deck={deck} pinnedTags={pinnedTags} className="fun-deck-tiles__why" />
      <div className="fun-deck-tiles__deck" data-tour-id={tourAnchor ? 'fun-decks-deck-list' : undefined}>
        {data?.cards.length ? (
          <ul className="fun-deck-tiles__list" role="list" aria-label={`Состав колоды ${deck.title}`}>
            {entries.map(entry => <TileEntry key={entry.card.dbfId} entry={entry} eager={eager} />)}
          </ul>
        ) : <DeckLoadState error={error} reload={reload} layout="tiles" empty={Boolean(data)} />}
      </div>
      <footer className="fun-deck-tiles__foot">
        {date ? <p className="fun-deck-tiles__date">Данные на <time dateTime={date.iso}>{date.label}</time></p> : null}
        <DeckCodeLine deckCode={deck.deckCode} />
        <CopyDeckButton deckCode={deck.deckCode} title={deck.title} className="fun-deck-tiles__copy" />
      </footer>
    </article>
  );
}
