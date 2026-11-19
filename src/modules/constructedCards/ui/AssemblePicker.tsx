import { useState } from 'react';
import type { AssembleCard, CardAssembleData } from '../model/cardAssemble';

/** Portraits shown before «Показать всех»: three rows of eight on a desktop, two rows of three on a phone. */
export const VISIBLE_PORTRAITS = { wide: 24, phone: 6 };
const PHONE_QUERY = '(max-width: 640px)';
const visiblePortraits = () => (typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches ? VISIBLE_PORTRAITS.phone : VISIBLE_PORTRAITS.wide);
/** Above this many portraits the ribbon gets a search field. */
const SEARCH_FROM = 20;

export const cardHref = (format: CardAssembleData['format'], cardId: string) => `/standard/cards/${format}/${encodeURIComponent(cardId)}/`;

/** Trimmed original art, so the circle shows the creature and not the card frame. */
const portraitUrl = (cardId: string) =>
  `/api/public-resource/hsjson/v1/orig/${encodeURIComponent(cardId)}.png?width=160&quality=82&format=webp&trim=1`;

export function Portrait({ card, className = '' }: { card: AssembleCard; className?: string }) {
  return (
    <span className={`assemble-portrait ${className}`.trim()}>
      <img src={portraitUrl(card.cardId)} alt="" loading="lazy" decoding="async" width={80} height={80} />
    </span>
  );
}

export type PickerItem = { id: string; card: AssembleCard; note: string; /** A donor that never met the base: dimmed, with its note. */ muted?: boolean };

/** Round portraits of cards to choose from: a wrapped ribbon, with a search field when there are many. */
export function PortraitPicker({ items, selected, onPick, label, searchLabel, size }: {
  items: PickerItem[];
  selected: readonly string[];
  onPick: (id: string) => void;
  label: string;
  searchLabel: string;
  size: 'large' | 'small';
}) {
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [limit] = useState(visiblePortraits);
  const needle = query.trim().toLocaleLowerCase('ru');
  const matches = needle ? items.filter(item => item.card.name.toLocaleLowerCase('ru').includes(needle)) : items;
  const shown = needle || all ? matches : matches.slice(0, limit);
  return (
    <div className={`assemble-picker assemble-picker--${size}`}>
      {items.length > SEARCH_FROM && (
        <label className="assemble-search">
          <span className="assemble-sr">{searchLabel}</span>
          <input type="search" value={query} placeholder={searchLabel} autoComplete="off" enterKeyHint="search"
            onChange={event => setQuery(event.target.value)} />
        </label>
      )}
      {shown.length > 0
        ? (
          <ul className="assemble-picker__list" aria-label={label}>
            {shown.map(item => (
              <li key={item.id}>
                <button type="button" className={item.muted ? 'is-nodata' : undefined} aria-pressed={selected.includes(item.id)} onClick={() => onPick(item.id)}>
                  <Portrait card={item.card} />
                  <span className="assemble-picker__name">{item.card.name}</span>
                  <span className="assemble-picker__note">{item.note}</span>
                </button>
              </li>
            ))}
          </ul>
        )
        : <p className="assemble-note">По запросу «{query.trim()}» никого не нашли.</p>}
      {!needle && matches.length > limit && (
        <button type="button" className="card-choices__more" aria-expanded={all} onClick={() => setAll(value => !value)}>
          {all ? 'Свернуть' : `Показать всех · ${matches.length}`}
        </button>
      )}
    </div>
  );
}
