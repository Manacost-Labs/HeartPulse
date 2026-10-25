'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { preferredScrollBehavior } from '../../../shared/ui/scrollBehavior';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import {
  LEADERBOARD_MODE_TABS, LEADERBOARD_REGION_LABELS, formatPlayers, formatSeasonLabel,
} from '../model/leaderboardsView';
import {
  bestSeason, modeSeasons, playerModes, profilePoints, profileUsesRating, profileViews, type ProfileView,
} from '../model/playerProfile';
import type { LeaderboardMode, LeaderboardPlayer, LeaderboardPlayerSeason, LeaderboardRegion } from '../model/types';
import { LeaderboardPlayerChart } from './LeaderboardPlayerChart';
import { StreamerBadge } from './StreamerBadge';
import type { Loadable } from './useLeaderboards';
import type { MyNick } from './useMyNick';

const VIEW_LABELS: Record<ProfileView, string> = { days: 'По дням', seasons: 'По сезонам' };

export type PlayerCardActions = {
  /** Показать место игрока в таблице этого сезона. */
  onShow: (season: LeaderboardPlayerSeason) => void;
  onRegion: (region: LeaderboardRegion) => void;
  onClose: () => void;
  onRetry: () => void;
  onMe: (nick: MyNick | null) => void;
};

function SeasonRow({ season, selected, onSelect }: { season: LeaderboardPlayerSeason; selected: boolean; onSelect: () => void }) {
  const place = `${formatPlayers(season.lastRank)}${season.final ? ' (итог)' : ''}`;
  return <li data-selected={selected || undefined}>
    <button type="button" className="leaderboards-player__season" aria-pressed={selected} onClick={onSelect}
      title={season.inLatest ? 'Показать место в таблице сезона' : undefined}>
      <span className="leaderboards-player__season-name">{formatSeasonLabel({ id: season.season, start: season.seasonStart, latest: season.latest })}</span>
      <span className="leaderboards-player__season-place">
        {place}{season.bestRank < season.lastRank && <small> · лучшее {formatPlayers(season.bestRank)}</small>}
      </span>
    </button>
  </li>;
}

function PlayerBody({ player, mode, actions }: { player: LeaderboardPlayer; mode: LeaderboardMode; actions: PlayerCardActions }) {
  const modes = playerModes(player);
  const [chosenMode, setChosenMode] = useState(modes.includes(mode) ? mode : modes[0]);
  const seasons = modeSeasons(player, chosenMode);
  const [chosenSeason, setChosenSeason] = useState<number | null>(null);
  const selected = seasons.find(season => season.season === chosenSeason) ?? seasons[0] ?? null;
  const views = profileViews(seasons, selected);
  const [chosenView, setChosenView] = useState<ProfileView | null>(null);
  const view = chosenView && views.includes(chosenView) ? chosenView : views[0];
  const best = seasons.length > 1 ? bestSeason(seasons) : null;

  return <>
    {(player.regions.length > 1 || modes.length > 1) && <div className="leaderboards-player__filters">
      {player.regions.length > 1 && <div className="leaderboards-regions" role="group" aria-label="Регион ника">
        {player.regions.map(region => <button key={region} type="button" className="leaderboards-chip" aria-pressed={region === player.region}
          onClick={() => { if (region !== player.region) actions.onRegion(region); }}>{LEADERBOARD_REGION_LABELS[region]}</button>)}
      </div>}
      {modes.length > 1 && <div className="leaderboards-player__modes" role="group" aria-label="Режим игрока">
        {modes.map(key => <button key={key} type="button" className="leaderboards-chip" aria-pressed={key === chosenMode}
          onClick={() => { setChosenMode(key); setChosenSeason(null); }}>{LEADERBOARD_MODE_TABS[key]}</button>)}
      </div>}
    </div>}
    {player.sharedName && <p className="leaderboards-muted">
      Под этим ником несколько аккаунтов: Blizzard не показывает номер BattleTag, поэтому их места здесь вместе.
    </p>}
    {best && <p className="leaderboards-player__best">
      Лучшее место — <strong>{formatPlayers(best.bestRank)}</strong>
      <span className="leaderboards-muted"> в сезоне {best.season}</span>
    </p>}
    {view && <div className="leaderboards-player__chart">
      {views.length > 1 && <div className="leaderboards-regions leaderboards-player__views" role="group" aria-label="График">
        {views.map(key => <button key={key} type="button" className="leaderboards-chip" aria-pressed={key === view} onClick={() => setChosenView(key)}>{VIEW_LABELS[key]}</button>)}
      </div>}
      <LeaderboardPlayerChart key={`${view}:${selected?.season}`} points={profilePoints(view, seasons, selected)}
        rating={profileUsesRating(view, seasons, selected)}
        title={view === 'days' && selected ? `Сезон ${selected.season} по дням` : 'Место по сезонам'} />
    </div>}
    <ul className="leaderboards-player__seasons" aria-label="Сезоны игрока">
      {seasons.map(season => <SeasonRow key={season.season} season={season} selected={season === selected}
        onSelect={() => { setChosenSeason(season.season); if (season.inLatest) actions.onShow(season); }} />)}
    </ul>
  </>;
}

/**
 * Карточка игрока: регионы и режимы, где есть его ник, лучшее место,
 * мини-график места (или рейтинга) по дням сезона и по сезонам и список
 * сезонов — нажатие показывает место игрока в таблице того сезона. На
 * широком экране карточка стоит справа от таблицы, на телефоне — над ней.
 */
export function LeaderboardPlayerCard({ name, region, mode, state, me, scrollOnOpen, actions }: {
  name: string;
  region: LeaderboardRegion;
  mode: LeaderboardMode;
  state: Loadable<LeaderboardPlayer>;
  me: MyNick | null;
  /** Карточку открыли нажатием, а не ссылкой при загрузке: на телефоне её надо показать. */
  scrollOnOpen: boolean;
  actions: PlayerCardActions;
}) {
  const player = state.value && state.value.name.toLowerCase() === name.toLowerCase() && state.value.region === region ? state.value : null;
  const ref = useRef<HTMLElement>(null);
  const isMe = Boolean(me && me.region === region && me.name.toLowerCase() === name.toLowerCase());

  // На телефоне карточка над таблицей: ник, нажатый внизу страницы, иначе открыл бы её за экраном.
  useEffect(() => {
    if (scrollOnOpen && window.matchMedia('(max-width: 1099px)').matches) {
      ref.current?.scrollIntoView({ block: 'start', behavior: preferredScrollBehavior() });
    }
  }, [name, scrollOnOpen]);

  return <section ref={ref} className="leaderboards-player" aria-labelledby="leaderboards-player-title">
    <header className="leaderboards-player__head">
      <div className="leaderboards-player__title">
        <p className="leaderboards-label">Игрок · {LEADERBOARD_REGION_LABELS[region]}</p>
        <h2 id="leaderboards-player-title">{player?.name ?? name}</h2>
        {player?.streamer && <StreamerBadge streamer={player.streamer} labelled />}
      </div>
      <button type="button" className="leaderboards-chip" aria-pressed={isMe}
        onClick={() => actions.onMe(isMe ? null : { name: player?.name ?? name, region })}>Это я</button>
      <button type="button" className="leaderboards-chip leaderboards-player__close" onClick={actions.onClose} aria-label="Закрыть карточку игрока">
        <X aria-hidden="true" />
      </button>
    </header>
    {player
      ? <PlayerBody key={`${player.region}:${player.name}`} player={player} mode={mode} actions={actions} />
      : state.status === 'missing'
        ? <p className="leaderboards-muted">Этого игрока нет в сохранённых таблицах региона «{LEADERBOARD_REGION_LABELS[region]}».</p>
        : state.status === 'error'
          ? <p className="leaderboards-muted" role="alert">Не удалось загрузить историю игрока. <button type="button" className="leaderboards-player-link" onClick={actions.onRetry}>Повторить</button></p>
          : <LoadingSurface label="Загружаем историю игрока" quiet layout="rows" blocksClassName="leaderboards-player__skeleton">
            <LoadingBlock className="leaderboards-skeleton__line" />
            <LoadingBlock className="leaderboards-skeleton__spark" />
            <LoadingBlock className="leaderboards-skeleton__line" />
          </LoadingSurface>}
  </section>;
}
