import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Copy } from 'lucide-react';
import CardPreviewTooltip, { type CardPreviewTarget } from '../CardPreviewTooltip';
import '../../vendor/hsreplay-deck-view/hsreplay-deck-view.css';
import './DeckListView.css';

export type DeckListCard = {
  id: string;
  dbfId: number;
  name: string;
  cost: number;
  rarity: string;
  elite: boolean;
  count: number;
  image: string;
  cardImage?: string;
  sideboardKeyDbfId?: number | null;
};

export type DeckListSideboard = {
  keyCardDbfId: number;
  label: string;
  keyCard?: DeckListCard | null;
  cards: DeckListCard[];
};

export type DeckListViewProps = {
  cards: DeckListCard[];
  sideboards?: DeckListSideboard[];
  title?: string;
  subtitle?: string;
  /** Optional color for the site-owned header above the HSReplay deck rows. */
  headerColor?: string;
  totalCards?: number;
  deckSizeLimit?: number;
  deckCode?: string;
  showCopy?: boolean;
  previewRows?: number;
  previewExpandable?: boolean;
  interactive?: boolean;
  onCardClick?: (card: DeckListCard) => void;
  onCardIncrement?: (card: DeckListCard) => void;
  onCardDecrement?: (card: DeckListCard) => void;
  className?: string;
  emptyText?: string;
};

function rarityKey(rarity: string): string {
  const value = String(rarity || 'COMMON').toLowerCase();
  if (value === 'free' || value === 'common' || value === 'rare' || value === 'epic' || value === 'legendary') return value;
  return 'common';
}

function DeckTile({
  card,
  interactive,
  indented,
  onClick,
  onIncrement,
  onDecrement,
  onPreview,
  onPreviewEnd,
}: {
  card: DeckListCard;
  interactive: boolean;
  indented?: boolean;
  onClick?: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onPreview: (card: DeckListCard, el: HTMLElement) => void;
  onPreviewEnd: () => void;
}) {
  const rarity = rarityKey(card.rarity);
  const hasControls = Boolean(interactive && (onIncrement || onDecrement));
  const hasCountBox = !hasControls && (card.count > 1 || card.elite);
  const className = `deck-tile hsrdv-card-tile${indented ? ' is-sideboard' : ''}${hasControls ? ' has-controls' : ''}`;
  const countLabel = card.elite && card.count === 1 ? '★' : String(card.count);

  const body = (
    <>
      <span className={`deck-tile__mana hsrdv-card-gem hsrdv-rarity-${rarity}`} aria-hidden="true">
        <span className="hsrdv-card-cost">{card.cost}</span>
      </span>
      <span className={`deck-tile__frame hsrdv-card-frame ${hasCountBox ? 'hsrdv-card-frame--with-count' : 'hsrdv-card-frame--without-count'}`}>
        {card.image ? <img className="deck-tile__art hsrdv-card-art" src={card.image} alt={card.name} /> : null}
        {hasCountBox ? (
          <span className="deck-tile__countbox hsrdv-card-countbox" aria-hidden="true">
            <span className={`deck-tile__count hsrdv-card-count${card.count > 1 ? ' hsrdv-card-count--copies' : ''}`}>{countLabel}</span>
          </span>
        ) : null}
        <span className="deck-tile__fade hsrdv-card-fade" aria-hidden="true" />
        <span className="deck-tile__name hsrdv-card-name">{card.name}</span>
      </span>
    </>
  );

  if (hasControls) {
    const atCopyLimit = card.count >= (card.elite || rarityKey(card.rarity) === 'legendary' ? 1 : 2);
    return (
      <div
        className={className}
        onMouseEnter={event => onPreview(card, event.currentTarget)}
        onMouseLeave={onPreviewEnd}
        onFocus={event => onPreview(card, event.currentTarget)}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onPreviewEnd();
        }}
        data-card-id={card.id}
        data-dbf-id={card.dbfId}
      >
        {body}
        <span className="deck-tile__controls">
          <button
            type="button"
            onClick={onDecrement}
            aria-label={`Убрать одну копию: ${card.name}`}
            title="Убрать одну копию"
          >
            −
          </button>
          <span aria-label={`${card.count} копий`}>{card.count}</span>
          <button
            type="button"
            onClick={onIncrement}
            disabled={atCopyLimit}
            aria-label={`Добавить ещё одну копию: ${card.name}`}
            title={atCopyLimit ? 'Достигнут лимит копий' : 'Добавить ещё одну копию'}
          >
            +
          </button>
        </span>
      </div>
    );
  }

  if (interactive) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        onMouseEnter={event => onPreview(card, event.currentTarget)}
        onMouseLeave={onPreviewEnd}
        onFocus={event => onPreview(card, event.currentTarget)}
        onBlur={onPreviewEnd}
        data-card-id={card.id}
        data-dbf-id={card.dbfId}
        aria-label={`${card.name}, ${card.cost} маны`}
        title={onClick ? 'Убрать одну копию' : card.name}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={className}
      onMouseEnter={event => onPreview(card, event.currentTarget)}
      onMouseLeave={onPreviewEnd}
      data-card-id={card.id}
      data-dbf-id={card.dbfId}
      aria-label={`${card.name}, ${card.cost} маны`}
    >
      {body}
    </div>
  );
}

/**
 * Single-column deck list using the vendored HSReplay tile contract.
 * Pass resolved `cards` / `sideboards` from `/api/deck/resolve` or the builder.
 */
export default function DeckListView({
  cards,
  sideboards = [],
  title,
  subtitle,
  headerColor,
  totalCards,
  deckSizeLimit = 30,
  deckCode = '',
  showCopy = false,
  previewRows = 0,
  previewExpandable = true,
  interactive = false,
  onCardClick,
  onCardIncrement,
  onCardDecrement,
  className = '',
  emptyText = 'Колода пуста.',
}: DeckListViewProps) {
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [expanded, setExpanded] = useState(false);
  const count = totalCards ?? cards.reduce((sum, card) => sum + card.count, 0);
  const copyLabel = copyState === 'ok'
    ? 'Код колоды скопирован'
    : copyState === 'error'
      ? 'Не удалось скопировать код'
      : 'Скопировать код колоды';
  const sections = useMemo(() => ({
    main: cards,
    sideboards: sideboards.filter(item => item.cards.length > 0),
  }), [cards, sideboards]);
  const collapsedRowCount = Math.max(0, Math.floor(previewRows));
  const sideboardRowCount = sections.sideboards.reduce((sum, section) => sum + section.cards.length, 0);
  const hiddenRowCount = Math.max(0, sections.main.length - collapsedRowCount) + sideboardRowCount;
  const isPreviewLimited = collapsedRowCount > 0 && hiddenRowCount > 0;
  const isCollapsed = isPreviewLimited && (!previewExpandable || !expanded);
  const visibleMainCards = isCollapsed
    ? sections.main.slice(0, collapsedRowCount)
    : sections.main;
  const visibleSideboards = isCollapsed ? [] : sections.sideboards;

  const showPreview = (card: DeckListCard, target: HTMLElement) => {
    if (!card.cardImage && !card.id) return;
    setPreview({
      id: card.id,
      name: card.name,
      imageUrl: card.cardImage || null,
      rect: target.getBoundingClientRect(),
    });
  };

  const copyCode = async () => {
    if (!deckCode) return;
    try {
      await navigator.clipboard.writeText(deckCode);
      setCopyState('ok');
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  return (
    <div className={`deck-list-view ${className}`.trim()}>
      {(title || subtitle) ? (
        <div className="deck-list-view__head" style={headerColor ? { backgroundColor: headerColor } : undefined}>
          <div>
            {title ? <strong>{title}</strong> : null}
            {subtitle ? <span className="deck-list-view__subtitle">{subtitle}</span> : null}
          </div>
          <span>{count}/{deckSizeLimit}</span>
        </div>
      ) : null}

      {sections.main.length === 0 && sections.sideboards.length === 0 ? (
        <p className="deck-list-view__empty">{emptyText}</p>
      ) : (
        <div className="deck-list-view__body">
          <div className="deck-list-view__hsreplay hsrdv">
            <ul className="deck-list-view__list hsrdv-list">
              {visibleMainCards.map(card => (
                <li key={`main-${card.dbfId}`}>
                  <DeckTile
                    card={card}
                    interactive={interactive}
                    onClick={onCardClick ? () => onCardClick(card) : undefined}
                    onIncrement={onCardIncrement ? () => onCardIncrement(card) : undefined}
                    onDecrement={onCardDecrement ? () => onCardDecrement(card) : undefined}
                    onPreview={showPreview}
                    onPreviewEnd={() => setPreview(null)}
                  />
                </li>
              ))}
            </ul>
          </div>

          {visibleSideboards.map(sideboard => (
            <section key={sideboard.keyCardDbfId} className="deck-list-view__sideboard" aria-label={sideboard.label}>
              <header className="deck-list-view__sideboard-head">
                <span>{sideboard.label}</span>
                <span>{sideboard.cards.reduce((sum, card) => sum + card.count, 0)}</span>
              </header>
              <div className="deck-list-view__hsreplay hsrdv">
                <ul className="deck-list-view__list hsrdv-list">
                  {sideboard.cards.map(card => (
                    <li key={`sb-${sideboard.keyCardDbfId}-${card.dbfId}`}>
                      <DeckTile
                        card={card}
                        interactive={interactive}
                        indented
                        onClick={onCardClick ? () => onCardClick(card) : undefined}
                        onPreview={showPreview}
                        onPreviewEnd={() => setPreview(null)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}

          {isPreviewLimited && previewExpandable ? (
            <button
              type="button"
              className="deck-list-view__expand"
              aria-expanded={expanded}
              onClick={() => setExpanded(value => !value)}
            >
              {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
              <span>{expanded ? 'Свернуть колоду' : 'Показать всю колоду'}</span>
              {!expanded ? <small>ещё {hiddenRowCount}</small> : null}
            </button>
          ) : null}
        </div>
      )}

      {showCopy ? (
        <div className="deck-list-view__actions">
          <button
            type="button"
            className="deck-list-view__copy-btn"
            onClick={() => void copyCode()}
            disabled={!deckCode}
            aria-label={copyLabel}
          >
            <Copy size={15} aria-hidden="true" />
            {copyLabel}
          </button>
        </div>
      ) : null}

      {preview ? <CardPreviewTooltip preview={preview} /> : null}
    </div>
  );
}
