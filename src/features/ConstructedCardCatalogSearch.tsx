import React, { useId } from 'react';
import { LoaderCircle, Search, X } from 'lucide-react';

type ConstructedCardCatalogSearchProps = {
  query: string;
  total: number;
  pending: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
};

function resultCopy(query: string, total: number, pending: boolean): string {
  if (pending) return 'Ищем…';
  if (!query.trim()) return `${total.toLocaleString('ru-RU')} карт`;
  return total > 0 ? `Найдено: ${total.toLocaleString('ru-RU')}` : 'Ничего не найдено';
}

export default function ConstructedCardCatalogSearch({
  query,
  total,
  pending,
  onChange,
  onClear,
}: ConstructedCardCatalogSearchProps) {
  const inputId = useId();
  const statusId = `${inputId}-status`;
  const hasQuery = Boolean(query);

  return (
    <div className="constructed-card-search" data-tour-id="cards-search">
      <div className="constructed-card-search__heading">
        <label htmlFor={inputId}>Поиск</label>
        <output id={statusId} aria-live="polite">{resultCopy(query, total, pending)}</output>
      </div>
      <div className="constructed-card-search__field" aria-busy={pending || undefined}>
        {pending
          ? <LoaderCircle className="constructed-card-search__spinner" size={18} aria-hidden="true" />
          : <Search size={18} aria-hidden="true" />}
        <input
          id={inputId}
          type="search"
          value={query}
          aria-label="Поиск карт"
          aria-describedby={statusId}
          autoComplete="off"
          spellCheck={false}
          placeholder="Название, английское имя или ID"
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape' && hasQuery) {
              event.preventDefault();
              onClear();
            }
          }}
        />
        {hasQuery && (
          <button type="button" onClick={onClear} aria-label="Очистить поиск" title="Очистить поиск">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
