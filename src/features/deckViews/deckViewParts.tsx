import type { ReactNode } from 'react';
import { Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../../shared/ui/LoadingSurface';
import { funDeckCardArt, funDeckManaCurve, type FunDeckCard, type FunDeckEntry } from '../funDecks/deckEntries';
import { useCopyDeckCode } from '../funDecks/useCopyDeckCode';
import { useDeckArt } from '../funDecks/useDeckArt';
import '../funDecks/FunDeckLayouts.css';

/*
 * The building blocks of the deck views (fun decks, archetype builds, a card's
 * decks): card tiles and portraits, the mana curve, the list states and the
 * copy button. They carry no page data, so any page can use them.
 */

export function cardLabel(card: FunDeckCard, cost = card.cost): string {
  return `${cost} маны · ${card.name}${card.count > 1 ? ` ×${card.count}` : ''}`;
}

/**
 * A card that opens its page, or plain art for tokens without one. The data
 * attributes are what the page's single hover preview reads; there is no
 * `title`, which would show a second tooltip next to the preview.
 */
export function CardLink({ card, cost, className, children }: { card: FunDeckCard; cost?: number; className: string; children: ReactNode }) {
  const label = cardLabel(card, cost);
  const preview = { 'data-fun-card': card.id, 'data-fun-card-name': card.name, 'data-fun-card-image': card.cardImage || card.image || undefined };
  return card.pagePath ? (
    <a className={className} href={card.pagePath} aria-label={label} {...preview}>{children}</a>
  ) : (
    <span className={className} role="img" aria-label={label} {...preview}>{children}</span>
  );
}

/** The deck code as text: a reader (and a search engine) sees it without a script, and it can be selected by hand. */
export function DeckCodeLine({ deckCode }: { deckCode: string }) {
  return <code className="fun-deck-code">{deckCode}</code>;
}

export function CopyDeckButton({ deckCode, title, className }: { deckCode: string; title: string; className: string }) {
  const { state, label, copy } = useCopyDeckCode(deckCode);
  return (
    <button type="button" className={`${className}${state === 'ok' ? ' is-copied' : ''}`}
      aria-label={`${label}: ${title}`} data-deck-code={deckCode} onClick={() => void copy()}>
      <Copy aria-hidden="true" />
      <span aria-live="polite">{state === 'idle' ? 'Копировать код' : label}</span>
    </button>
  );
}

const TILE_BLOCKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] as const;
const ROW_BLOCKS = ['a'] as const;

export function DeckLoadState({ error, reload, layout, empty = false }: {
  error: string; reload: () => void; layout: 'tiles' | 'rows'; empty?: boolean;
}) {
  if (empty) {
    return <div className={`fun-deck-layout-state fun-deck-layout-state--${layout}`}><span>Состав этой колоды пока недоступен.</span></div>;
  }
  if (error) {
    return (
      <div className={`fun-deck-layout-state fun-deck-layout-state--${layout}`} role="alert">
        <TriangleAlert aria-hidden="true" />
        <strong>Состав не загрузился</strong>
        <button type="button" onClick={reload}>
          <RefreshCw aria-hidden="true" />
          Повторить
        </button>
      </div>
    );
  }
  return (
    <LoadingSurface label="Загружаем состав колоды" quiet layout="rows"
      className={`fun-deck-layout-state fun-deck-layout-state--${layout}`} blocksClassName="fun-deck-layout-state__blocks">
      {(layout === 'tiles' ? TILE_BLOCKS : ROW_BLOCKS).map(id => <LoadingBlock key={id} className="fun-deck-layout-state__block" />)}
    </LoadingSurface>
  );
}

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

export function TileEntry({ entry, eager }: { entry: FunDeckEntry; eager: boolean }) {
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

/** «Строки»: one deck per line with round card portraits and the mana curve. */
export function DeckPortrait({ card, configuredCost = null, small = false, eager }: {
  card: FunDeckCard; configuredCost?: number | null; small?: boolean; eager: boolean;
}) {
  const art = useDeckArt();
  const cost = configuredCost ?? card.cost;
  const rarity = (card.rarity || 'common').toLowerCase();
  return (
    <CardLink card={card} cost={cost} className={`fun-deck-portrait is-${rarity}${small ? ' is-small' : ''}${art.status === 'loaded' ? ' is-loaded' : ''}`}>
      <span className="fun-deck-portrait__ring">
        <b aria-hidden="true">{cost}</b>
        {art.showImage ? (
          <img key={art.attempt} {...art.imageProps} src={funDeckCardArt(card.id, 'portrait')} alt="" width={96} height={96}
            loading={eager ? 'eager' : 'lazy'} decoding="async" />
        ) : null}
      </span>
      {card.elite ? <span className="fun-deck-portrait__badge is-star" aria-hidden="true">★</span>
        : card.count > 1 ? <span className="fun-deck-portrait__badge" aria-hidden="true">×{card.count}</span> : null}
    </CardLink>
  );
}

export function ManaCurve({ entries }: { entries: readonly FunDeckEntry[] }) {
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
