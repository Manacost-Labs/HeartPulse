import React, { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import CardPreviewTooltip, { type CardPreviewTarget } from '../CardPreviewTooltip';
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
  /** Class color used as HSGuru-style left→art gradient fill. */
  headerColor?: string;
  totalCards?: number;
  deckSizeLimit?: number;
  deckCode?: string;
  showCopy?: boolean;
  interactive?: boolean;
  onCardClick?: (card: DeckListCard) => void;
  onCardIncrement?: (card: DeckListCard) => void;
  onCardDecrement?: (card: DeckListCard) => void;
  className?: string;
  emptyText?: string;
};

const RARITY_COLOR: Record<string, string> = {
  free: '#8f969e',
  common: '#8f969e',
  rare: '#246a9f',
  epic: '#702487',
  legendary: '#92501e',
};

function rarityKey(rarity: string): string {
  const value = String(rarity || 'COMMON').toLowerCase();
  if (value === 'free') return 'common';
  if (value === 'common' || value === 'rare' || value === 'epic' || value === 'legendary') return value;
  return 'common';
}

function DeckTile({
  card,
  interactive,
  indented,
  classColor,
  onClick,
  onIncrement,
  onDecrement,
  onPreview,
  onPreviewEnd,
}: {
  card: DeckListCard;
  interactive: boolean;
  indented?: boolean;
  classColor?: string;
  onClick?: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onPreview: (card: DeckListCard, el: HTMLElement) => void;
  onPreviewEnd: () => void;
}) {
  const rarity = RARITY_COLOR[rarityKey(card.rarity)] || RARITY_COLOR.common;
  // Inside the row: class color (HSGuru-style). Mana/count keep their own meaning.
  const fill = classColor || rarity;
  const style = {
    ['--deck-tile-rarity' as string]: rarity,
    ['--deck-tile-fill' as string]: fill,
    ['--deck-tile-border' as string]: 'rgba(244, 207, 103, 0.24)',
    ['--deck-tile-art' as string]: card.image ? `url(${JSON.stringify(card.image)})` : 'none',
  };
  const hasControls = Boolean(interactive && (onIncrement || onDecrement));
  const className = `deck-tile deck-tile--${rarityKey(card.rarity)}${indented ? ' is-sideboard' : ''}${hasControls ? ' has-controls' : ''}`;
  const countLabel = card.elite ? '★' : card.count > 1 ? String(card.count) : '';

  const body = (
    <>
      {/* Art under row (HSGuru .decklist-card-tile); fade overlay covers bright tile edge */}
      <span className="deck-tile__art" aria-hidden="true" />
      <span className="deck-tile__fade" aria-hidden="true" />
      <span className="deck-tile__mana" aria-hidden="true">{card.cost}</span>
      <span className="deck-tile__name">{card.name}</span>
      {!hasControls ? <span className="deck-tile__count" aria-hidden="true">{countLabel}</span> : null}
    </>
  );

  if (hasControls) {
    const atCopyLimit = card.count >= (card.elite || rarityKey(card.rarity) === 'legendary' ? 1 : 2);
    return (
      <div
        className={className}
        style={style}
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
        style={style}
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
      style={style}
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
 * Single-column deck list (HSGuru-style tiles) for embed anywhere on the site.
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
  interactive = false,
  onCardClick,
  onCardIncrement,
  onCardDecrement,
  className = '',
  emptyText = 'Колода пуста.',
}: DeckListViewProps) {
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
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
          <ul className="deck-list-view__list">
            {sections.main.map(card => (
              <li key={`main-${card.dbfId}`}>
                <DeckTile
                  card={card}
                  interactive={interactive}
                  classColor={headerColor}
                  onClick={onCardClick ? () => onCardClick(card) : undefined}
                  onIncrement={onCardIncrement ? () => onCardIncrement(card) : undefined}
                  onDecrement={onCardDecrement ? () => onCardDecrement(card) : undefined}
                  onPreview={showPreview}
                  onPreviewEnd={() => setPreview(null)}
                />
              </li>
            ))}
          </ul>

          {sections.sideboards.map(sideboard => (
            <section key={sideboard.keyCardDbfId} className="deck-list-view__sideboard" aria-label={sideboard.label}>
              <header className="deck-list-view__sideboard-head">
                <span>{sideboard.label}</span>
                <span>{sideboard.cards.reduce((sum, card) => sum + card.count, 0)}</span>
              </header>
              <ul className="deck-list-view__list">
                {sideboard.cards.map(card => (
                  <li key={`sb-${sideboard.keyCardDbfId}-${card.dbfId}`}>
                    <DeckTile
                      card={card}
                      interactive={interactive}
                      indented
                      classColor={headerColor}
                      onClick={onCardClick ? () => onCardClick(card) : undefined}
                      onPreview={showPreview}
                      onPreviewEnd={() => setPreview(null)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
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
