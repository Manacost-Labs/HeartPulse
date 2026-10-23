import { useState } from 'react';
import { DataTable, type DataTableColumn } from '../../vendor/varylo-ui/data-display/DataTable';
import type { SortState } from '../../vendor/varylo-ui/data-display/data-table';
import { SegmentedControl } from '../../vendor/varylo-ui/navigation/SegmentedControl';
import { KpiGroup } from '../../vendor/varylo-ui/data-display/KpiGroup';
import {
  CLASS_LABELS,
  VsGlobal,
  classIconUrl,
  formatGameDate,
  formatNumber,
  formatPercent,
  winrate,
  type ArenaStats,
} from '../../modules/playerStats/public';
import { DATA_TABLE_LABELS, KPI_LABELS } from './playerStatsLabels';
import { GlobalNote, StatsBlock } from './StatsBlock';

type Run = ArenaStats['runs'][number];
type ClassRow = ArenaStats['classes'][number];

function ClassCell({ playerClass }: { playerClass: Run['playerClass'] }) {
  return (
    <span className="player-stats-class">
      <img src={classIconUrl(playerClass)} alt="" width="24" height="24" loading="lazy" decoding="async" />
      <span><strong>{CLASS_LABELS[playerClass]}</strong></span>
    </span>
  );
}

const score = (run: Pick<Run, 'wins' | 'losses'>) => `${run.wins}–${run.losses}`;

const RUN_COLUMNS: DataTableColumn<Run>[] = [
  { key: 'playerClass', header: 'Класс', sortable: true, accessor: run => CLASS_LABELS[run.playerClass],
    cell: run => <ClassCell playerClass={run.playerClass} /> },
  { key: 'wins', header: 'Счёт', align: 'right', sortable: true, cell: run => (
    <span className="player-stats-score" data-best={run.wins >= 7 ? 'true' : undefined}>
      {score(run)}{run.complete ? null : <small>идёт</small>}
    </span>
  ) },
  { key: 'games', header: 'Игр', align: 'right', sortable: true },
  { key: 'lastPlayedAt', header: 'Дата', align: 'right', sortable: true, cell: run => formatGameDate(run.lastPlayedAt) },
];

const CLASS_COLUMNS: DataTableColumn<ClassRow>[] = [
  { key: 'playerClass', header: 'Класс', sortable: true, accessor: row => CLASS_LABELS[row.playerClass],
    cell: row => <ClassCell playerClass={row.playerClass} /> },
  { key: 'runs', header: 'Забегов', align: 'right', sortable: true },
  { key: 'averageWins', header: 'Средние победы', align: 'right', sortable: true, cell: row => (
    <span className="player-stats-metric">
      <strong>{formatNumber(row.averageWins, 2)}</strong>
      <VsGlobal own={row.averageWins} global={row.globalAverageWins} digits={2} />
    </span>
  ) },
  { key: 'winrate', header: 'Винрейт игр', align: 'right', sortable: true, accessor: row => winrate(row) ?? -1, cell: row => (
    <span className="player-stats-metric">
      <strong>{formatPercent(winrate(row))}</strong>
      <VsGlobal own={winrate(row)} global={row.globalWinrate} unit="%" />
    </span>
  ) },
];

const RUN_ORDER: Record<string, SortState> = {
  recent: { key: 'lastPlayedAt', direction: 'desc' },
  best: { key: 'wins', direction: 'desc' },
};

/** Arena: runs with their score (latest or best first), average wins and classes. */
export function ArenaStatsView({ stats }: { stats: ArenaStats }) {
  const { summary } = stats;
  const [sort, setSort] = useState<SortState | null>(RUN_ORDER.recent);
  const table = { density: 'compact' as const, locale: 'ru-RU', labels: DATA_TABLE_LABELS };
  return (
    <>
      <div className="player-stats-summary player-stats-summary--wide">
        <KpiGroup locale="ru-RU" labels={KPI_LABELS} minTileWidth={150} items={[
          { id: 'runs', label: 'Забегов', value: summary.runs, caption: `игр ${formatNumber(stats.games)}` },
          { id: 'average', label: 'Средние победы', value: summary.averageWins, format: { maximumFractionDigits: 2 } },
          { id: 'twelve', label: '12 побед', value: summary.twelveWinRuns,
            caption: summary.bestRun ? `лучший: ${score(summary.bestRun)}, ${CLASS_LABELS[summary.bestRun.playerClass]}` : undefined },
          { id: 'winrate', label: 'Винрейт игр', value: summary.gameWinrate === null ? null : summary.gameWinrate / 100,
            format: { style: 'percent', maximumFractionDigits: 1 } },
          { id: 'time', label: 'Время в игре', value: Math.round(summary.timePlayedSeconds / 360) / 10,
            format: { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 1 } },
        ]} />
      </div>
      <GlobalNote availability={stats.global.availability} section="arena" />
      <StatsBlock title="Забеги" aside={(
        <SegmentedControl aria-label="Порядок забегов" size="sm" value={sort?.key === 'wins' ? 'best' : 'recent'}
          onValueChange={value => setSort(RUN_ORDER[value])}
          options={[{ value: 'recent', label: 'Последние' }, { value: 'best', label: 'Лучшие' }]} />
      )}>
        <DataTable label="Забеги" data={stats.runs} columns={RUN_COLUMNS} getRowId={run => run.runId} pageSize={10}
          sort={sort} onSortChange={setSort} {...table} />
      </StatsBlock>
      <StatsBlock title="Классы">
        <DataTable label="Классы" data={stats.classes} columns={CLASS_COLUMNS} getRowId={row => row.playerClass} {...table} />
      </StatsBlock>
    </>
  );
}
