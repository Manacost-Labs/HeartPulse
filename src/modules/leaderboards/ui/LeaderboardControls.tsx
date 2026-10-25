'use client';

import { useEffect, useId, useState } from 'react';
import { Search } from 'lucide-react';
import {
  LEADERBOARD_MODE_TABS, LEADERBOARD_REGION_LABELS, formatSeasonLabel,
  type LeaderboardSelection,
} from '../model/leaderboardsView';
import { LEADERBOARD_MODES, LEADERBOARD_REGIONS, type LeaderboardSeason } from '../model/types';

/** Поиск уходит на сервер после паузы в наборе, а не на каждую букву. */
const SEARCH_DELAY_MS = 350;

/** Одна строка выбора: вкладки режимов, регион и сезон. */
export function LeaderboardControls({ selection, seasons, onSelect }: {
  selection: LeaderboardSelection;
  /** Сохранённые сезоны выбранного режима и региона, новые первыми. */
  seasons: LeaderboardSeason[];
  onSelect: (change: Partial<LeaderboardSelection>) => void;
}) {
  const seasonId = useId();
  const seasonValue = selection.season ?? seasons[0]?.id ?? '';
  return <div className="leaderboards-controls">
    <div className="leaderboards-modes" role="group" aria-label="Режим">
      {LEADERBOARD_MODES.map(mode => <button key={mode} type="button" className="leaderboards-chip leaderboards-chip--mode"
        aria-pressed={selection.mode === mode} onClick={() => onSelect({ mode })}>{LEADERBOARD_MODE_TABS[mode]}</button>)}
    </div>
    <div className="leaderboards-controls__filters">
      <div className="leaderboards-regions" role="group" aria-label="Регион">
        {LEADERBOARD_REGIONS.map(region => <button key={region} type="button" className="leaderboards-chip"
          aria-pressed={selection.region === region} onClick={() => onSelect({ region })}>{LEADERBOARD_REGION_LABELS[region]}</button>)}
      </div>
      <label className="sr-only" htmlFor={seasonId}>Сезон</label>
      <select id={seasonId} className="leaderboards-select" value={seasonValue} disabled={!seasons.length}
        onChange={event => onSelect({ season: Number(event.target.value) === seasons[0]?.id ? null : Number(event.target.value) })}>
        {seasons.length
          ? seasons.map(season => <option key={season.id} value={season.id}>{formatSeasonLabel(season)}</option>)
          : <option value="">Нет сохранённых сезонов</option>}
      </select>
    </div>
  </div>;
}

/** Поиск игрока над таблицей: запрос уходит на сервер после паузы в наборе. */
export function LeaderboardSearch({ query, onSelect }: {
  query: string;
  onSelect: (change: Partial<LeaderboardSelection>) => void;
}) {
  const searchId = useId();
  const [draft, setDraft] = useState(query);

  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => {
    const next = draft.trim();
    if (next === query) return undefined;
    const timer = setTimeout(() => onSelect({ query: next }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, query, onSelect]);

  return <label className="leaderboards-search" htmlFor={searchId}>
    <span className="sr-only">Игрок</span>
    <Search aria-hidden="true" />
    <input id={searchId} type="search" inputMode="search" autoComplete="off" spellCheck={false} maxLength={32}
      placeholder="Найти игрока" value={draft} onChange={event => setDraft(event.target.value)} />
  </label>;
}
