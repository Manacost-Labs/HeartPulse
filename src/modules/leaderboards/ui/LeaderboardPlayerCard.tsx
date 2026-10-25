'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { LineChart } from '../../../shared/ui/analytics/LineChart';
import type { ChartPoint } from '../../../shared/ui/analytics/analyticsModel';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import {
  LEADERBOARD_MODE_LABELS, LEADERBOARD_REGION_LABELS, formatLeaderboardDay, formatPlayers, formatRating, formatSeasonLabel,
} from '../model/leaderboardsView';
import type { LeaderboardMode, LeaderboardPlayer, LeaderboardPlayerSeason } from '../model/types';
import type { Loadable } from './useLeaderboards';

function seasonKey(season: LeaderboardPlayerSeason): string {
  return `${season.mode}:${season.season}`;
}

function SeasonChart({ season }: { season: LeaderboardPlayerSeason }) {
  const points = useMemo<ChartPoint[]>(() => season.series.map(point => ({
    x: point.day, y: point.rank, tick: `${Number(point.day.slice(8, 10))}.${point.day.slice(5, 7)}`,
    label: formatLeaderboardDay(point.day),
    detail: point.rating === null ? undefined : `${formatRating(season.mode, point.rating)} · из ${formatPlayers(point.players)}`,
  })), [season]);
  const title = `${LEADERBOARD_MODE_LABELS[season.mode]}, ${formatSeasonLabel({ id: season.season, start: season.seasonStart })}`;
  if (points.length < 2) {
    const [point] = season.series;
    return <p className="leaderboards-muted leaderboards-player__single">
      {title}: {point ? `${formatPlayers(point.rank)} место ${point.final ? 'в итоговой таблице' : `на ${formatLeaderboardDay(point.day)}`}` : 'нет снимков'}.
      {' '}История по дням копится с каждым обновлением.
    </p>;
  }
  return <LineChart title={`Место по дням: ${title}`} subtitle="Чем выше линия, тем ближе к первому месту" unit="count" invert color="#8d171d"
    points={points} domain={{ minimum: 1 }} xLabel="День" />;
}

function PlayerBody({ player, mode }: { player: LeaderboardPlayer; mode: LeaderboardMode }) {
  const initial = player.seasons.find(season => season.mode === mode) ?? player.seasons[0];
  const [chosen, setChosen] = useState(initial ? seasonKey(initial) : '');
  const selected = player.seasons.find(season => seasonKey(season) === chosen) ?? initial;
  const current = player.seasons.filter(season => season.latest && season.inLatest);
  return <>
    {player.sharedName && <p className="leaderboards-muted">
      Под этим ником в таблице несколько аккаунтов: Blizzard не показывает номер BattleTag, поэтому их места здесь вместе.
    </p>}
    {current.length > 0 && <ul className="leaderboards-player__current" aria-label="Места в текущих сезонах">
      {current.map(season => <li key={seasonKey(season)}>
        <span className="leaderboards-label">{LEADERBOARD_MODE_LABELS[season.mode]}</span>
        <strong>{formatPlayers(season.lastRank)} место</strong>
        {season.rated && season.lastRating !== null && <span className="leaderboards-muted">{formatRating(season.mode, season.lastRating)}</span>}
      </li>)}
    </ul>}
    {selected && <SeasonChart key={seasonKey(selected)} season={selected} />}
    <div className="leaderboards-player__seasons" role="region" aria-label="Все сезоны игрока" tabIndex={0}>
      <table>
        <caption className="sr-only">Все сохранённые сезоны игрока. Нажмите на сезон, чтобы показать его график.</caption>
        <thead><tr>
          <th scope="col">Сезон</th><th scope="col" className="is-numeric">Лучшее место</th>
          <th scope="col" className="is-numeric">Последнее</th><th scope="col" className="is-numeric">Дней</th>
        </tr></thead>
        <tbody>{player.seasons.map(season => <tr key={seasonKey(season)} data-selected={seasonKey(season) === chosen || undefined}>
          <td><button type="button" className="leaderboards-player-link" aria-pressed={seasonKey(season) === chosen} onClick={() => setChosen(seasonKey(season))}>
            {LEADERBOARD_MODE_LABELS[season.mode]} · {season.season}{season.latest ? ' (текущий)' : ''}
          </button></td>
          <td className="is-numeric">{formatPlayers(season.bestRank)}</td>
          <td className="is-numeric">{formatPlayers(season.lastRank)}{season.final ? ' (итог)' : ''}</td>
          <td className="is-numeric">{formatPlayers(season.series.length)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

/** Карточка игрока под панелью выбора: места в текущих сезонах, история по дням и все сезоны. */
export function LeaderboardPlayerCard({ name, region, mode, state, onClose, onRetry }: {
  name: string;
  region: LeaderboardPlayer['region'];
  mode: LeaderboardMode;
  state: Loadable<LeaderboardPlayer>;
  onClose: () => void;
  onRetry: () => void;
}) {
  const player = state.value && state.value.name.toLowerCase() === name.toLowerCase() ? state.value : null;
  return <section className="leaderboards-player" aria-labelledby="leaderboards-player-title">
    <header className="leaderboards-player__head">
      <div>
        <p className="leaderboards-label">Игрок · {LEADERBOARD_REGION_LABELS[region]}</p>
        <h2 id="leaderboards-player-title">{player?.name ?? name}</h2>
      </div>
      <button type="button" className="leaderboards-chip leaderboards-player__close" onClick={onClose} aria-label="Закрыть карточку игрока">
        <X aria-hidden="true" />
      </button>
    </header>
    {player
      ? <PlayerBody player={player} mode={mode} />
      : state.status === 'missing'
        ? <p className="leaderboards-muted">Этого игрока нет в сохранённых таблицах региона «{LEADERBOARD_REGION_LABELS[region]}».</p>
        : state.status === 'error'
          ? <p className="leaderboards-muted" role="alert">Не удалось загрузить историю игрока. <button type="button" className="leaderboards-player-link" onClick={onRetry}>Повторить</button></p>
          : <LoadingSurface label="Загружаем историю игрока" quiet layout="rows" blocksClassName="leaderboards-player__skeleton">
            <LoadingBlock className="leaderboards-skeleton__line" />
            <LoadingBlock className="leaderboards-skeleton__chart" />
          </LoadingSurface>}
  </section>;
}
