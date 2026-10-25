'use client';

import { useEffect, useId, useState } from 'react';
import { CornerDownLeft, Search, UserRound } from 'lucide-react';
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

/**
 * «К месту N»: номер места открывает его страницу и подсвечивает строку.
 * Поле не трогает выбор, пока номер не отправлен (Enter или стрелка).
 */
export function LeaderboardJump({ max, onJump }: { max: number; onJump: (rank: number) => void }) {
  const jumpId = useId();
  const [draft, setDraft] = useState('');
  const rank = Number(draft);
  const valid = /^\d{1,5}$/.test(draft) && rank >= 1 && rank <= max;
  return <form className="leaderboards-jump" onSubmit={event => {
    event.preventDefault();
    if (!valid) return;
    onJump(rank);
    setDraft('');
  }}>
    <label className="sr-only" htmlFor={jumpId}>К месту</label>
    <input id={jumpId} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={5} placeholder="К месту"
      value={draft} onChange={event => setDraft(event.target.value.replace(/\D/g, ''))} />
    <button type="submit" className="leaderboards-jump__go" disabled={!valid} aria-label="Перейти к месту"><CornerDownLeft aria-hidden="true" /></button>
  </form>;
}

/** «К моему нику» — только когда зритель отметил себя в карточке игрока. */
export function LeaderboardMyNick({ name, onClick }: { name: string; onClick: () => void }) {
  return <button type="button" className="leaderboards-chip leaderboards-me" onClick={onClick} title={`К месту игрока ${name}`}>
    <UserRound aria-hidden="true" /><span>К моему нику</span>
  </button>;
}
