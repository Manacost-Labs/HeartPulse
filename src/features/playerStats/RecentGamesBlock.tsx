import { DataTable, type DataTableColumn } from '../../vendor/varylo-ui/data-display/DataTable';
import {
  CLASS_LABELS,
  cardImageUrl,
  classIconUrl,
  formatDuration,
  formatGameDate,
  formatSigned,
  rankLabel,
  type RecentArenaGame,
  type RecentBattlegroundsGame,
  type RecentConstructedGame,
} from '../../modules/playerStats/public';
import { DATA_TABLE_LABELS } from './playerStatsLabels';
import { StatsBlock } from './StatsBlock';

const RESULT_LABELS = { win: 'Победа', loss: 'Поражение', tie: 'Ничья' } as const;
const table = { density: 'compact' as const, locale: 'ru-RU', labels: DATA_TABLE_LABELS, pageSize: 10 };

function ClassCell({ playerClass, detail }: { playerClass: RecentConstructedGame['playerClass']; detail?: string | null }) {
  return (
    <span className="player-stats-class">
      <img src={classIconUrl(playerClass)} alt="" width="24" height="24" loading="lazy" decoding="async" />
      <span><strong>{detail || CLASS_LABELS[playerClass]}</strong>{detail ? <small>{CLASS_LABELS[playerClass]}</small> : null}</span>
    </span>
  );
}

/** The game's web replay, when the player uploaded it from the app; the link names the game for a screen reader. */
function replayColumn<T extends { replayId: string | null; startedAt: number }>(): DataTableColumn<T> {
  return { key: 'replayId', header: 'Реплей', align: 'right', cell: game => (game.replayId
    ? <a href={`/replay/${game.replayId}`} aria-label={`Смотреть реплей игры ${formatGameDate(game.startedAt)}`}>Смотреть</a>
    : <><span aria-hidden="true">—</span><span className="player-stats-visually-hidden">Реплея на сайте нет</span></>) };
}

const dateColumn = <T extends { startedAt: number }>(): DataTableColumn<T> =>
  ({ key: 'startedAt', header: 'Дата', cell: game => formatGameDate(game.startedAt) });

const CONSTRUCTED_COLUMNS: DataTableColumn<RecentConstructedGame>[] = [
  dateColumn(),
  { key: 'result', header: 'Итог', cell: game => <span data-result={game.result}>{RESULT_LABELS[game.result]}</span> },
  { key: 'playerClass', header: 'Колода', cell: game => <ClassCell playerClass={game.playerClass} detail={game.deckName ?? game.archetype} /> },
  { key: 'opponentClass', header: 'Соперник', cell: game => <ClassCell playerClass={game.opponentClass} detail={game.opponentArchetype} /> },
  { key: 'turns', header: 'Ходов', align: 'right', cell: game => (game.turns ?? '—') },
  { key: 'durationSeconds', header: 'Время', align: 'right', cell: game => formatDuration(game.durationSeconds) },
  { key: 'rankAfter', header: 'Ранг', align: 'right', cell: game => (game.ranked ? rankLabel(game.rankAfter) : 'Обычная') },
  replayColumn(),
];

function battlegroundsColumns(names: Record<string, string>): DataTableColumn<RecentBattlegroundsGame>[] {
  return [
    dateColumn(),
    { key: 'placement', header: 'Место', align: 'right', cell: game => <span data-result={game.result}>{game.placement}</span> },
    { key: 'heroCardId', header: 'Герой', cell: game => (
      <span className="player-stats-hero">
        <span className="player-stats-hero__art"><img src={cardImageUrl(game.heroCardId)} alt="" decoding="async" loading="lazy" /></span>
        <strong>{names[game.heroCardId] ?? 'Герой'}</strong>
      </span>
    ) },
    { key: 'ratingAfter', header: 'Рейтинг', align: 'right', cell: game => (game.ratingAfter ?? '—') },
    { key: 'delta', header: 'Изменение', align: 'right', cell: game => <span className="player-stats-signed">{formatSigned(game.delta)}</span> },
    replayColumn(),
  ];
}

const ARENA_COLUMNS: DataTableColumn<RecentArenaGame>[] = [
  dateColumn(),
  { key: 'result', header: 'Итог', cell: game => <span data-result={game.result}>{RESULT_LABELS[game.result]}</span> },
  { key: 'playerClass', header: 'Класс', cell: game => <ClassCell playerClass={game.playerClass} /> },
  { key: 'opponentClass', header: 'Соперник', cell: game => <ClassCell playerClass={game.opponentClass} /> },
  { key: 'gameNumber', header: 'Игра забега', align: 'right' },
  replayColumn(),
];

/** «Последние игры»: the newest games of the period, one by one, with a link to the web replay when there is one. */
export function RecentConstructedGames({ games }: { games: RecentConstructedGame[] }) {
  if (games.length === 0) return null;
  return (
    <StatsBlock title="Последние игры">
      <DataTable label="Последние игры" data={games} columns={CONSTRUCTED_COLUMNS} getRowId={game => game.id} {...table} />
    </StatsBlock>
  );
}

export function RecentBattlegroundsGames({ games, names }: { games: RecentBattlegroundsGame[]; names: Record<string, string> }) {
  if (games.length === 0) return null;
  return (
    <StatsBlock title="Последние игры">
      <DataTable label="Последние игры" data={games} columns={battlegroundsColumns(names)} getRowId={game => game.id} {...table} />
    </StatsBlock>
  );
}

export function RecentArenaGames({ games }: { games: RecentArenaGame[] }) {
  if (games.length === 0) return null;
  return (
    <StatsBlock title="Последние игры">
      <DataTable label="Последние игры" data={games} columns={ARENA_COLUMNS} getRowId={game => game.id} {...table} />
    </StatsBlock>
  );
}
