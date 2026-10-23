import { useMemo } from 'react';
import { DataTable, type DataTableColumn } from '../../vendor/varylo-ui/data-display/DataTable';
import { KpiGroup } from '../../vendor/varylo-ui/data-display/KpiGroup';
import {
  CLASS_LABELS,
  RankTimeline,
  VsGlobal,
  classIconUrl,
  formatDuration,
  formatGameDate,
  formatNumber,
  formatPercent,
  rankLabel,
  winrate,
  type ConstructedStats,
} from '../../modules/playerStats/public';
import { DATA_TABLE_LABELS, KPI_LABELS } from './playerStatsLabels';
import { GlobalNote, StatsBlock } from './StatsBlock';

type HearthstoneClass = ConstructedStats['classes'][number]['playerClass'];
type Row = { games: number; wins: number };

function ClassName({ playerClass, detail }: { playerClass: HearthstoneClass; detail?: string | null }) {
  return (
    <span className="player-stats-class">
      <img src={classIconUrl(playerClass)} alt="" width="24" height="24" loading="lazy" decoding="async" />
      <span><strong>{detail || CLASS_LABELS[playerClass]}</strong>{detail ? <small>{CLASS_LABELS[playerClass]}</small> : null}</span>
    </span>
  );
}

const gamesColumn = <T extends Row>(): DataTableColumn<T> => ({ key: 'games', header: 'Игр', align: 'right', sortable: true });
const winrateColumn = <T extends Row>(global?: (row: T) => number | null): DataTableColumn<T> => ({
  key: 'winrate', header: 'Винрейт', align: 'right', sortable: true, accessor: row => winrate(row) ?? -1,
  cell: row => (
    <span className="player-stats-metric">
      <strong>{formatPercent(winrate(row))}</strong>
      {global ? <VsGlobal own={winrate(row)} global={global(row)} unit="%" /> : null}
    </span>
  ),
});

/** Matchups as a grid: rows are the player's classes, columns the opponents met. */
function MatchupGrid({ matchups }: { matchups: ConstructedStats['matchups'] }) {
  const own = [...new Set(matchups.map(item => item.playerClass))];
  const opponents = [...new Set(matchups.map(item => item.opponentClass))].sort();
  const cell = new Map(matchups.map(item => [`${item.playerClass}:${item.opponentClass}`, item]));
  return (
    <div className="player-stats-matchups">
      <table>
        <caption className="player-stats-visually-hidden">Винрейт ваших классов против классов соперников</caption>
        <thead>
          <tr>
            <th scope="col"><span className="player-stats-visually-hidden">Ваш класс</span></th>
            {opponents.map(opponent => (
              <th key={opponent} scope="col">
                <img src={classIconUrl(opponent)} alt={CLASS_LABELS[opponent]} title={CLASS_LABELS[opponent]} width="24" height="24" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {own.map(playerClass => (
            <tr key={playerClass}>
              <th scope="row"><ClassName playerClass={playerClass} /></th>
              {opponents.map(opponent => {
                const entry = cell.get(`${playerClass}:${opponent}`);
                const rate = entry ? winrate(entry) : null;
                return (
                  <td key={opponent} data-tone={rate === null ? undefined : rate > 50 ? 'better' : rate < 50 ? 'worse' : 'even'}
                    title={entry ? `${CLASS_LABELS[playerClass]} против: ${CLASS_LABELS[opponent]} — ${entry.wins} из ${entry.games}` : undefined}>
                    {rate === null ? '—' : formatPercent(rate)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Standard or Wild: rank over time, decks, classes, opponents and matchups. */
export function ConstructedStatsView({ stats }: { stats: ConstructedStats }) {
  const { summary } = stats;
  const columns = useMemo(() => ({
    decks: [
      { key: 'deck', header: 'Колода', sortable: true, accessor: (row: ConstructedStats['decks'][number]) => row.deckName ?? row.archetype ?? '',
        cell: (row: ConstructedStats['decks'][number]) => <ClassName playerClass={row.playerClass} detail={row.deckName ?? row.archetype} /> },
      gamesColumn<ConstructedStats['decks'][number]>(),
      winrateColumn<ConstructedStats['decks'][number]>(),
      { key: 'lastPlayedAt', header: 'Последняя игра', align: 'right', sortable: true,
        cell: (row: ConstructedStats['decks'][number]) => formatGameDate(row.lastPlayedAt) },
    ] satisfies DataTableColumn<ConstructedStats['decks'][number]>[],
    classes: [
      { key: 'playerClass', header: 'Класс', cell: (row: ConstructedStats['classes'][number]) => <ClassName playerClass={row.playerClass} /> },
      gamesColumn<ConstructedStats['classes'][number]>(),
      winrateColumn<ConstructedStats['classes'][number]>(row => row.globalWinrate),
    ] satisfies DataTableColumn<ConstructedStats['classes'][number]>[],
    archetypes: [
      { key: 'archetype', header: 'Архетип', sortable: true,
        cell: (row: ConstructedStats['archetypes'][number]) => <ClassName playerClass={row.playerClass} detail={row.archetype} /> },
      gamesColumn<ConstructedStats['archetypes'][number]>(),
      winrateColumn<ConstructedStats['archetypes'][number]>(row => row.globalWinrate),
    ] satisfies DataTableColumn<ConstructedStats['archetypes'][number]>[],
    opponents: [
      { key: 'opponentClass', header: 'Соперник', cell: (row: ConstructedStats['opponentClasses'][number]) => <ClassName playerClass={row.opponentClass} /> },
      gamesColumn<ConstructedStats['opponentClasses'][number]>(),
      winrateColumn<ConstructedStats['opponentClasses'][number]>(),
    ] satisfies DataTableColumn<ConstructedStats['opponentClasses'][number]>[],
  }), []);
  const table = { density: 'compact' as const, locale: 'ru-RU', labels: DATA_TABLE_LABELS, pageSize: 10 };
  return (
    <>
      <div className="player-stats-summary player-stats-summary--wide">
        <KpiGroup locale="ru-RU" labels={KPI_LABELS} minTileWidth={150} items={[
          { id: 'winrate', label: 'Винрейт', value: summary.winrate === null ? null : summary.winrate / 100,
            format: { style: 'percent', maximumFractionDigits: 1 },
            caption: `первым ходом ${formatPercent(winrate(summary.first))} · с монетой ${formatPercent(winrate(summary.coin))}` },
          { id: 'games', label: 'Игр', value: stats.games, caption: `побед ${formatNumber(summary.wins)} · поражений ${formatNumber(summary.losses)}` },
          { id: 'length', label: 'Средняя игра', value: summary.averageTurns, format: { maximumFractionDigits: 1 },
            caption: `ходов · ${formatDuration(summary.averageDurationSeconds)}` },
          { id: 'time', label: 'Время в игре', value: Math.round(summary.timePlayedSeconds / 360) / 10,
            format: { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 1 } },
        ]} />
        {summary.currentRank ? (
          <dl className="player-stats-ranks">
            <div><dt>Ранг сейчас</dt><dd>{rankLabel(summary.currentRank)}</dd></div>
            <div><dt>Лучший</dt><dd>{rankLabel(summary.bestRank)}</dd></div>
            <div><dt>Рейтинговых игр</dt><dd>{formatNumber(summary.rankedGames)}</dd></div>
          </dl>
        ) : null}
      </div>
      {stats.rankSeries.length > 1 ? (
        <StatsBlock title="Ранг по играм"><RankTimeline points={stats.rankSeries} /></StatsBlock>
      ) : null}
      <GlobalNote availability={stats.global.availability} section="standard" />
      <div className="player-stats-grid">
        <StatsBlock title="Колоды">
          <DataTable label="Колоды" data={stats.decks} columns={columns.decks} getRowId={row => row.key} {...table} />
        </StatsBlock>
        <StatsBlock title="Классы">
          <DataTable label="Классы" data={stats.classes} columns={columns.classes} getRowId={row => row.playerClass} {...table} />
        </StatsBlock>
        {stats.archetypes.length ? (
          <StatsBlock title="Архетипы">
            <DataTable label="Архетипы" data={stats.archetypes} columns={columns.archetypes} getRowId={row => `${row.playerClass}:${row.archetype}`} {...table} />
          </StatsBlock>
        ) : null}
        <StatsBlock title="Соперники">
          <DataTable label="Соперники" data={stats.opponentClasses} columns={columns.opponents} getRowId={row => row.opponentClass} {...table} />
        </StatsBlock>
      </div>
      <StatsBlock title="Матчапы"><MatchupGrid matchups={stats.matchups} /></StatsBlock>
    </>
  );
}
