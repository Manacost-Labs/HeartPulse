import { score } from '../FunDeckFacts';
import { funDeckCardArt, type FunDeckCard, type FunDeckEntry } from './deckEntries';
import { useDeckArt } from './useDeckArt';
import { CardLink, CopyDeckButton, DeckLoadState, WhyTags, useFunDeck, winRate, winRateTone, type DeckCardProps } from './funDeckCardParts';

/**
 * «Плитки»: deck-builder rows in narrow columns, many decks side by side. The
 * tile is always drawn (mana gem, name, count) and the picture lies over it
 * once loaded, so a slow or failed image never leaves an empty box.
 */
function DeckTile({ card, configuredCost = null, eager }: { card: FunDeckCard; configuredCost?: number | null; eager: boolean }) {
  const art = useDeckArt();
  const cost = configuredCost ?? card.cost;
  const rarity = (card.rarity || 'common').toLowerCase();
  return (
    <CardLink card={card} cost={cost} className={`fun-deck-tile is-${rarity}${art.status === 'loaded' ? ' is-loaded' : ''}`}>
      <span className="fun-deck-tile__fallback" aria-hidden="true">
        <b>{cost}</b><span>{card.name}</span>
      </span>
      {art.showImage ? (
        <img key={art.attempt} {...art.imageProps} src={funDeckCardArt(card.id, 'row')} alt="" width={400} height={80}
          loading={eager ? 'eager' : 'lazy'} decoding="async" />
      ) : null}
      {configuredCost !== null && art.status === 'loaded' ? <span className="fun-deck-tile__mana" aria-hidden="true">{configuredCost}</span> : null}
      {card.count > 1 ? <span className="fun-deck-tile__count" aria-hidden="true">×{card.count}</span>
        : card.elite && art.status !== 'loaded' ? <span className="fun-deck-tile__count is-star" aria-hidden="true">★</span> : null}
    </CardLink>
  );
}

function TileEntry({ entry, eager }: { entry: FunDeckEntry; eager: boolean }) {
  return (
    <li>
      <DeckTile card={entry.card} configuredCost={entry.configuredCost} eager={eager} />
      {entry.sideboard.length ? (
        <div className="fun-deck-tiles__side">
          <span>{entry.sideboardLabel}</span>
          <ul role="list" aria-label={entry.sideboardLabel ?? undefined}>
            {entry.sideboard.map(card => <li key={card.dbfId}><DeckTile card={card} eager={eager} /></li>)}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function FunDeckTilesCard({ deck, fresh = false, tourAnchor = false, eager = false, pinnedTags = [] }: DeckCardProps) {
  const { data, error, reload, classMeta, entries, subtitle, ref } = useFunDeck(deck, eager);
  return (
    <article className="fun-deck-tiles" ref={ref}>
      <header className="fun-deck-tiles__head">
        <img src={classMeta.icon} alt="" width="34" height="34" loading="lazy" decoding="async" />
        <div>
          <h2 title={deck.title}>{deck.title}</h2>
          <p><span>{subtitle}</span>{fresh ? <strong>Новая</strong> : null}</p>
        </div>
      </header>
      <dl className="fun-deck-tiles__stats" data-tour-id={tourAnchor ? 'fun-decks-card-metrics' : undefined}>
        <div className={winRateTone(deck)}><dt>Винрейт</dt><dd>{winRate(deck, 0)}</dd></div>
        <div><dt>Игры</dt><dd>{deck.games?.toLocaleString('ru-RU') ?? '—'}</dd></div>
        <div><dt>Фан</dt><dd>{score(deck.funScore)}</dd></div>
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
        <CopyDeckButton deck={deck} className="fun-deck-tiles__copy" />
      </footer>
    </article>
  );
}
