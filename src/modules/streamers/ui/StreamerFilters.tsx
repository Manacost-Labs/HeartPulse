import { useId } from 'react';
import type { StreamerFilters as Filters, StreamerFormat } from '../model/types';

export type FilterOption<T> = { value: T; label: string };

/** Формат кнопками, класс списком; «Все» сбрасывает фильтр. */
export function StreamerFilters({ filters, formats, classes, onChange }: {
  filters: Filters;
  formats: FilterOption<StreamerFormat>[];
  classes: FilterOption<string>[];
  onChange: (filters: Filters) => void;
}) {
  const classId = useId();
  return <div className="streamers-filters">
    {formats.length > 1 ? <div className="streamers-chips" role="group" aria-label="Формат">
      <button type="button" className="streamers-chip" aria-pressed={filters.format === null}
        onClick={() => onChange({ format: null, classKey: filters.classKey })}>Все форматы</button>
      {formats.map(option => <button key={option.value} type="button" className="streamers-chip" aria-pressed={filters.format === option.value}
        onClick={() => onChange({ format: option.value, classKey: filters.classKey })}>{option.label}</button>)}
    </div> : null}
    {classes.length ? <label className="streamers-select" htmlFor={classId}>
      <span className="streamers-visually-hidden">Класс</span>
      <select id={classId} value={filters.classKey ?? ''} onChange={event => onChange({ format: filters.format, classKey: event.target.value || null })}>
        <option value="">Все классы</option>
        {classes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label> : null}
  </div>;
}
