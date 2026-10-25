'use client';

import { useEffect, useId, useState } from 'react';
import { Search } from 'lucide-react';
import { STREAMER_CLASS_LABELS, STREAMER_FORMAT_LABELS, streamerSearchQuery } from '../model/streamersView';
import type { StreamerFormat, StreamerSort, StreamersFilters } from '../model/types';

const FORMATS: readonly StreamerFormat[] = ['standard', 'wild'];
const SORTS: readonly { value: StreamerSort; label: string }[] = [
  { value: 'active', label: 'По активности' },
  { value: 'rank', label: 'По рангу' },
];
const SEARCH_DELAY_MS = 350;

/**
 * Фильтры каталога одной строкой: язык, формат, класс, «в эфире», поиск по
 * нику и сортировка. Поиск уходит после паузы в наборе.
 */
export function StreamersToolbar({ filters, onChange }: { filters: StreamersFilters; onChange: (filters: StreamersFilters) => void }) {
  const id = useId();
  const [text, setText] = useState(filters.query ?? '');
  const [sentQuery, setSentQuery] = useState(filters.query);
  // «Сбросить фильтры» снаружи очищает и поле; набранный текст при ответе на поиск не трогаем.
  if (filters.query !== sentQuery) {
    setSentQuery(filters.query);
    if (filters.query === null) setText('');
  }

  useEffect(() => {
    const query = streamerSearchQuery(text);
    if (query === filters.query) return undefined;
    const timer = window.setTimeout(() => onChange({ ...filters, query }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, filters, onChange]);

  return <div className="streamers-toolbar">
    <div className="streamers-chips streamers-toolbar__language" role="group" aria-label="Язык трансляций">
      <button type="button" className="streamers-chip" aria-pressed={filters.language === null}
        onClick={() => onChange({ ...filters, language: null })}>Все языки</button>
      <button type="button" className="streamers-chip" aria-pressed={filters.language === 'ru'}
        onClick={() => onChange({ ...filters, language: 'ru' })}>Русские</button>
    </div>
    <label className="streamers-select streamers-toolbar__format" htmlFor={`${id}-format`}>
      <span className="streamers-visually-hidden">Формат</span>
      <select id={`${id}-format`} value={filters.format ?? ''}
        onChange={event => onChange({ ...filters, format: FORMATS.find(format => format === event.target.value) ?? null })}>
        <option value="">Все форматы</option>
        {FORMATS.map(format => <option key={format} value={format}>{STREAMER_FORMAT_LABELS[format]}</option>)}
      </select>
    </label>
    <label className="streamers-select streamers-toolbar__class" htmlFor={`${id}-class`}>
      <span className="streamers-visually-hidden">Класс</span>
      <select id={`${id}-class`} value={filters.classKey ?? ''} onChange={event => onChange({ ...filters, classKey: event.target.value || null })}>
        <option value="">Все классы</option>
        {Object.entries(STREAMER_CLASS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <button type="button" className="streamers-chip streamers-toolbar__live" aria-pressed={filters.live}
      onClick={() => onChange({ ...filters, live: !filters.live })}>В эфире</button>
    <label className="streamers-search" htmlFor={`${id}-search`}>
      <Search aria-hidden="true" />
      <span className="streamers-visually-hidden">Поиск по нику</span>
      <input id={`${id}-search`} type="search" value={text} maxLength={40} placeholder="Ник стримера" autoComplete="off"
        spellCheck={false} onChange={event => setText(event.target.value)} />
    </label>
    <label className="streamers-select streamers-toolbar__sort" htmlFor={`${id}-sort`}>
      <span className="streamers-visually-hidden">Сортировка</span>
      <select id={`${id}-sort`} value={filters.sort}
        onChange={event => onChange({ ...filters, sort: event.target.value === 'rank' ? 'rank' : 'active' })}>
        {SORTS.map(sort => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
      </select>
    </label>
  </div>;
}
