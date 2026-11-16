import { useState, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import {
  CLASS_LABELS,
  PROFILE_STATS_TEXT,
  cardImageUrl,
  classIconUrl,
  formatDuration,
  formatGameDate,
  formatSigned,
  rankLabel,
  type ProfileStatsText,
  type RecentArenaGame,
  type RecentBattlegroundsGame,
  type RecentConstructedGame,
} from '../../modules/playerStats/public';
import { StatsBlock } from './StatsBlock';

const PAGE = 10;
const RESULT_LABELS = { win: 'Победа', loss: 'Поражение', tie: 'Ничья' } as const;
type Game = { id: string; startedAt: number; replayId: string | null };

/**
 * The game's web replay: its link preview (the same picture a shared link
 * shows) and «Смотреть». The preview loads lazily and keeps its box, so the
 * list does not move while pictures arrive.
 */
function Replay({ game, text }: { game: Game; text: ProfileStatsText }) {
  if (!game.replayId) {
    return <span className="profile-game__replay" data-none=""><span className="player-stats-visually-hidden">{text.noReplay}</span></span>;
  }
  return (
    <a className="profile-game__replay" href={`/replay/${game.replayId}`}
      aria-label={`${text.watch}: ${formatGameDate(game.startedAt)}`}>
      <img src={`/og/replay/${encodeURIComponent(game.replayId)}`} alt="" width="120" height="63" loading="lazy" decoding="async" />
      <span className="profile-game__watch"><Play size={14} aria-hidden="true" />{text.watch}</span>
    </a>
  );
}

function GameList<T extends Game>({ games, row, text }: {
  games: T[];
  row: (game: T) => { result: string; tone: 'win' | 'loss' | 'tie'; main: ReactNode; facts: string };
  text: ProfileStatsText;
}) {
  const [shown, setShown] = useState(PAGE);
  return (
    <StatsBlock title={text.recent} wide>
      <ol className="profile-games">
        {games.slice(0, shown).map(game => {
          const view = row(game);
          return (
            <li key={game.id} className="profile-game" data-result={view.tone}>
              <span className="profile-game__result">{view.result}</span>
              <span className="profile-game__main">{view.main}</span>
              <span className="profile-game__facts">{view.facts}</span>
              <time className="profile-game__date" dateTime={new Date(game.startedAt).toISOString()}>{formatGameDate(game.startedAt)}</time>
              <Replay game={game} text={text} />
            </li>
          );
        })}
      </ol>
      {games.length > shown ? (
        <button type="button" className="profile-games__more" onClick={() => setShown(value => value + PAGE)}>{text.showMore}</button>
      ) : null}
    </StatsBlock>
  );
}

function ClassName({ playerClass, detail }: { playerClass: RecentConstructedGame['playerClass']; detail?: string | null }) {
  return (
    <span className="profile-game__class">
      <img src={classIconUrl(playerClass)} alt="" width="24" height="24" loading="lazy" decoding="async" />
      <span>{detail || CLASS_LABELS[playerClass]}</span>
    </span>
  );
}

/** «vs» and the opponent stay together, so a narrow row breaks before them, never inside. */
function Opponent({ children }: { children: ReactNode }) {
  return <span className="profile-game__opponent"><span className="profile-game__vs" aria-label="против">vs</span>{children}</span>;
}

export function RecentConstructedGames({ games, text = PROFILE_STATS_TEXT.ru }: { games: RecentConstructedGame[]; text?: ProfileStatsText }) {
  if (games.length === 0) return null;
  return (
    <GameList games={games} text={text} row={game => ({
      result: RESULT_LABELS[game.result],
      tone: game.result,
      main: <><ClassName playerClass={game.playerClass} detail={game.deckName ?? game.archetype} />
        <Opponent><ClassName playerClass={game.opponentClass} detail={game.opponentArchetype} /></Opponent></>,
      facts: [game.ranked ? rankLabel(game.rankAfter) : 'Обычная', game.turns ? `${game.turns} ход.` : null,
        formatDuration(game.durationSeconds)].filter(Boolean).join(' · '),
    })} />
  );
}

export function RecentBattlegroundsGames({ games, names, text = PROFILE_STATS_TEXT.ru }: {
  games: RecentBattlegroundsGame[];
  names: Record<string, string>;
  text?: ProfileStatsText;
}) {
  if (games.length === 0) return null;
  return (
    <GameList games={games} text={text} row={game => ({
      result: `${game.placement}-е`,
      tone: game.result,
      main: (
        <span className="profile-game__class">
          <img className="profile-game__hero" src={cardImageUrl(game.heroCardId)} alt="" width="32" height="32" loading="lazy" decoding="async" />
          <span>{names[game.heroCardId] ?? 'Герой'}</span>
        </span>
      ),
      facts: [game.ratingAfter === null ? null : `${game.ratingAfter.toLocaleString('ru-RU')} (${formatSigned(game.delta)})`,
        formatDuration(game.durationSeconds)].filter(Boolean).join(' · '),
    })} />
  );
}

export function RecentArenaGames({ games, text = PROFILE_STATS_TEXT.ru }: { games: RecentArenaGame[]; text?: ProfileStatsText }) {
  if (games.length === 0) return null;
  return (
    <GameList games={games} text={text} row={game => ({
      result: RESULT_LABELS[game.result],
      tone: game.result,
      main: <><ClassName playerClass={game.playerClass} /><Opponent><ClassName playerClass={game.opponentClass} /></Opponent></>,
      facts: `${game.gameNumber}-я игра забега`,
    })} />
  );
}
