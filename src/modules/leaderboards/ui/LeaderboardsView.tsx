'use client';

import { useState } from 'react';
import { LEADERBOARD_MAX_RANK, leaderboardSeasons } from '../model/leaderboardsView';
import { LeaderboardControls, LeaderboardJump, LeaderboardMyNick, LeaderboardSearch } from './LeaderboardControls';
import { LeaderboardPlayerCard, type PlayerCardActions } from './LeaderboardPlayerCard';
import { LeaderboardCharts, LeaderboardSummary } from './LeaderboardSummary';
import { LeaderboardTableView } from './LeaderboardTableView';
import {
  LeaderboardCollecting, LeaderboardMissing, LeaderboardSummarySkeleton, LeaderboardTableSkeleton, LeaderboardsUnavailable,
} from './LeaderboardsSkeleton';
import { useLeaderboards, type LeaderboardsInitial } from './useLeaderboards';
import { useJumpToMyNick, useMyNick } from './useMyNick';
import './Leaderboards.css';

/**
 * Страница таблиц лидеров: один раздел в деревянной рамке — липкая панель
 * выбора (режим, регион, сезон, переходы и поиск), сводка плитками, таблица и
 * карточка игрока (справа от таблицы на широком экране). Пока грузится новая
 * таблица, прежняя остаётся на месте приглушённой; скелетон — только без данных.
 */
export function LeaderboardsView({ initial }: { initial: LeaderboardsInitial }) {
  const { selection, select, catalog, collecting, table, stats, player, retry } = useLeaderboards(initial);
  const seasons = leaderboardSeasons(catalog.value, selection.mode, selection.region);
  const failed = table.status === 'error' && !table.value;
  const showsTable = !collecting && !failed && table.status !== 'missing';
  const [me, setMe] = useMyNick();
  // Игрок из ссылки при загрузке: его карточку не прокручиваем, пока зритель сам не откроет другую.
  const [landedPlayer, setLandedPlayer] = useState(initial.selection.player);
  const jumpToMe = useJumpToMyNick(selection, catalog.value, select);
  const stored = stats.value?.snapshot.stored ?? table.value?.snapshot.stored ?? LEADERBOARD_MAX_RANK;
  const actions: PlayerCardActions = {
    onShow: season => select({ mode: season.mode, season: season.season, rank: season.lastRank }),
    onRegion: region => select({ region, player: selection.player }),
    onClose: () => { setLandedPlayer(null); select({ player: null }); },
    onRetry: retry,
    onMe: setMe,
  };

  return <div className="leaderboards" data-mode={selection.mode}>
    <section className="leaderboards-board" aria-label="Таблица лидеров">
      <LeaderboardControls selection={selection} seasons={seasons} onSelect={select}>
        {showsTable && <>
          <LeaderboardJump max={Math.min(stored, LEADERBOARD_MAX_RANK)} onJump={rank => select({ rank })} />
          {me && <LeaderboardMyNick name={me.name} onClick={() => { setLandedPlayer(null); void jumpToMe.go(me); }} />}
          <LeaderboardSearch query={selection.query} onSelect={select} />
        </>}
      </LeaderboardControls>
      {collecting ? <LeaderboardCollecting mode={selection.mode} region={selection.region} /> : failed
        ? <LeaderboardsUnavailable onRetry={retry} />
        : table.status === 'missing'
          ? <LeaderboardMissing />
          : <>
            {jumpToMe.message && <p className="leaderboards-muted leaderboards-board__note" role="status">{jumpToMe.message}</p>}
            {stats.value && stats.status !== 'missing'
              ? <div className="data-surface" aria-busy={stats.status === 'loading' || undefined}>
                <LeaderboardSummary stats={stats.value} onRank={rank => select({ rank })} />
              </div>
              : stats.status === 'loading' ? <LeaderboardSummarySkeleton /> : null}
            <div className={selection.player ? 'leaderboards-body has-player' : 'leaderboards-body'}>
              {selection.player && <LeaderboardPlayerCard name={selection.player} region={selection.region} mode={selection.mode}
                state={player} me={me} scrollOnOpen={selection.player !== landedPlayer} actions={actions} />}
              <div className="leaderboards-body__main">
                {table.value
                  ? <LeaderboardTableView table={table.value} busy={table.status === 'loading'} selectedPlayer={selection.player}
                    targetRank={selection.rank} onPage={page => select({ page })} onPlayer={name => { setLandedPlayer(null); select({ player: name }); }} />
                  : <LeaderboardTableSkeleton />}
                {table.status === 'error' && table.value && <p className="leaderboards-muted" role="alert">
                  Не удалось обновить таблицу. <button type="button" className="leaderboards-player-link" onClick={retry}>Повторить</button>
                </p>}
              </div>
            </div>
          </>}
    </section>
    {showsTable && stats.value && stats.status === 'ready' && <LeaderboardCharts stats={stats.value} />}
    <p className="leaderboards-muted leaderboards-source">
      Данные — официальные таблицы лидеров Blizzard (hearthstone.blizzard.com). Текущие сезоны обновляются четыре раза в сутки;
      ник показан без номера BattleTag, как у Blizzard. Значок стримера ставится по совпадению ника с каталогом стримеров.
    </p>
  </div>;
}
