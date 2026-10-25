'use client';

import { leaderboardSeasons } from '../model/leaderboardsView';
import { LeaderboardControls, LeaderboardSearch } from './LeaderboardControls';
import { LeaderboardPlayerCard } from './LeaderboardPlayerCard';
import { LeaderboardCharts, LeaderboardSummary } from './LeaderboardSummary';
import { LeaderboardTableView } from './LeaderboardTableView';
import {
  LeaderboardMissing, LeaderboardSummarySkeleton, LeaderboardTableSkeleton, LeaderboardsUnavailable,
} from './LeaderboardsSkeleton';
import { useLeaderboards, type LeaderboardsInitial } from './useLeaderboards';
import './Leaderboards.css';

/**
 * Страница таблиц лидеров: строка выбора режима, региона и сезона, плашки
 * порогов с поиском, карточка игрока и сама таблица. Пока грузится новая таблица,
 * прежняя остаётся на месте приглушённой; скелетон — только без данных.
 */
export function LeaderboardsView({ initial }: { initial: LeaderboardsInitial }) {
  const { selection, select, catalog, table, stats, player, retry } = useLeaderboards(initial);
  const seasons = leaderboardSeasons(catalog.value, selection.mode, selection.region);
  const failed = table.status === 'error' && !table.value;

  return <div className="leaderboards">
    <LeaderboardControls selection={selection} seasons={seasons} onSelect={select} />
    {failed
      ? <LeaderboardsUnavailable onRetry={retry} />
      : table.status === 'missing'
        ? <LeaderboardMissing />
        : <>
          <div className="leaderboards-toolbar">
            {stats.value && stats.status !== 'missing'
              ? <div className="data-surface" aria-busy={stats.status === 'loading' || undefined}><LeaderboardSummary stats={stats.value} /></div>
              : stats.status === 'loading' ? <LeaderboardSummarySkeleton /> : <span />}
            <LeaderboardSearch query={selection.query} onSelect={select} />
          </div>
          {selection.player && <LeaderboardPlayerCard name={selection.player} region={selection.region} mode={selection.mode}
            state={player} onClose={() => select({ player: null })} onRetry={retry} />}
          {table.value
            ? <LeaderboardTableView table={table.value} busy={table.status === 'loading'} selectedPlayer={selection.player}
              onPage={page => select({ page })} onPlayer={name => select({ player: name })} />
            : <LeaderboardTableSkeleton />}
          {stats.value && stats.status === 'ready' && <LeaderboardCharts stats={stats.value} />}
          {table.status === 'error' && table.value && <p className="leaderboards-muted" role="alert">
            Не удалось обновить таблицу. <button type="button" className="leaderboards-player-link" onClick={retry}>Повторить</button>
          </p>}
        </>}
    <p className="leaderboards-muted leaderboards-source">
      Данные — официальные таблицы лидеров Blizzard (hearthstone.blizzard.com). Текущие сезоны обновляются четыре раза в сутки;
      ник показан без номера BattleTag, как у Blizzard.
    </p>
  </div>;
}
