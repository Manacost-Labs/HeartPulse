import { RotateCcw, Search } from 'lucide-react';
import {
  FUN_DECK_CLASSES,
  FUN_DECK_TAGS,
  FUN_DECKS_SORTS,
  type FunDecksView,
} from './funDecksPreview';
import type { FunDecksFilters as Filters } from './useFunDecksFilters';

const FORMATS: Array<{ id: FunDecksView['format']; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'standard', label: 'Стандарт' },
  { id: 'wild', label: 'Вольный' },
];

function toggled<Item extends string>(list: readonly Item[], item: Item): Item[] {
  return list.includes(item) ? list.filter(other => other !== item) : [...list, item];
}

/** Format, search and sort, then class and type; what is chosen stays pressed, and a reset appears once anything is. */
export function FunDecksFilters({ filters, query, counts, filtered, resultText, onChange, onSearch, onReset }: {
  filters: Filters;
  query: string;
  counts: Record<FunDecksView['format'], number>;
  filtered: boolean;
  /** "Найдено: N", spoken as the list changes; empty when there is nothing to report. */
  resultText: string;
  onChange: (patch: Partial<Filters>) => void;
  onSearch: (text: string) => void;
  onReset: () => void;
}) {
  return (
    <section className="fun-decks-tools" aria-label="Фильтры фан-колод" data-tour-id="fun-decks-filters">
      <div className="fun-decks-tools__main">
        <div className="fun-decks-tools__formats" role="group" aria-label="Формат">
          {FORMATS.map(format => (
            <button key={format.id} type="button" aria-pressed={filters.format === format.id}
              onClick={() => onChange({ format: format.id })}>
              {format.label}
              <span>{counts[format.id]}</span>
            </button>
          ))}
        </div>
        <label className="fun-decks-tools__search">
          <Search aria-hidden="true" />
          <span className="sr-only">Найти колоду или класс</span>
          <input type="search" value={query} onChange={event => onSearch(event.target.value)} placeholder="Найти колоду или класс" />
        </label>
        <label className="fun-decks-tools__sort">
          <span>Сортировка</span>
          <select value={filters.sort} onChange={event => onChange({ sort: event.target.value as Filters['sort'] })}>
            {FUN_DECKS_SORTS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="fun-decks-tools__refine">
        <div className="fun-decks-tools__classes" role="group" aria-labelledby="fun-decks-class-filter">
          <span id="fun-decks-class-filter">Класс</span>
          {FUN_DECK_CLASSES.map(item => (
            <button key={item.id} type="button" title={item.label} aria-label={item.label}
              aria-pressed={filters.classes.includes(item.id)}
              onClick={() => onChange({ classes: toggled(filters.classes, item.id) })}>
              <img src={item.icon} alt="" width="28" height="28" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
        <div className="fun-decks-tools__tags" role="group" aria-labelledby="fun-decks-tag-filter">
          <span id="fun-decks-tag-filter">Тип</span>
          {FUN_DECK_TAGS.map(tag => (
            <button key={tag.id} type="button" aria-pressed={filters.tags.includes(tag.id)}
              onClick={() => onChange({ tags: toggled(filters.tags, tag.id) })}>
              {tag.label}
            </button>
          ))}
        </div>
        <div className="fun-decks-tools__result">
          <p role="status">{resultText}</p>
          {filtered ? (
            <button type="button" onClick={onReset}>
              <RotateCcw aria-hidden="true" />
              Сбросить фильтры
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
