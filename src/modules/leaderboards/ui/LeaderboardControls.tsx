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

export function LeaderboardControls({ selection, seasons, onSelect }: {
  selection: LeaderboardSelection;
  /** Сохранённые сезоны выбранного режима и региона, новые первыми. */
  seasons: LeaderboardSeason[];
  onSelect: (change: Partial<LeaderboardSelection>) => void;
}) {
  const seasonId = useId();
  const searchId = useId();
  const [draft, setDraft] = useState(selection.query);

  useEffect(() => { setDraft(selection.query); }, [selection.query]);
  useEffect(() => {
    const query = draft.trim();
    if (query === selection.query) return undefined;
    const timer = setTimeout(() => onSelect({ query }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, selection.query, onSelect]);

  const seasonValue = selection.season ?? seasons[0]?.id ?? '';
  return <div className="leaderboards-controls">
    <div className="leaderboards-modes" role="group" aria-label="Режим">
      {LEADERBOARD_MODES.map(mode => <button key={mode} type="button" className="leaderboards-chip leaderboards-chip--mode"
        aria-pressed={selection.mode === mode} onClick={() => onSelect({ mode })}>{LEADERBOARD_MODE_TABS[mode]}</button>)}
    </div>
    <div className="leaderboards-controls__row">
      <div className="leaderboards-regions" role="group" aria-label="Регион">
        {LEADERBOARD_REGIONS.map(region => <button key={region} type="button" className="leaderboards-chip"
          aria-pressed={selection.region === region} onClick={() => onSelect({ region })}>{LEADERBOARD_REGION_LABELS[region]}</button>)}
      </div>
      <label className="leaderboards-field" htmlFor={seasonId}>
        <span className="leaderboards-label">Сезон</span>
        <select id={seasonId} className="leaderboards-select" value={seasonValue} disabled={!seasons.length}
          onChange={event => onSelect({ season: Number(event.target.value) === seasons[0]?.id ? null : Number(event.target.value) })}>
          {seasons.length
            ? seasons.map(season => <option key={season.id} value={season.id}>{formatSeasonLabel(season)}</option>)
            : <option value="">Нет сохранённых сезонов</option>}
        </select>
      </label>
      <label className="leaderboards-field leaderboards-field--search" htmlFor={searchId}>
        <span className="leaderboards-label">Игрок</span>
        <span className="leaderboards-search">
          <Search aria-hidden="true" />
          <input id={searchId} type="search" inputMode="search" autoComplete="off" spellCheck={false} maxLength={32}
            placeholder="Ник без #номера" value={draft} onChange={event => setDraft(event.target.value)} />
        </span>
      </label>
    </div>
  </div>;
}
