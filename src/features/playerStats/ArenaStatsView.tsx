import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../../vendor/varylo-ui/data-display/DataTable';
import type { SortState } from '../../vendor/varylo-ui/data-display/data-table';
import { SegmentedControl } from '../../vendor/varylo-ui/navigation/SegmentedControl';
import {
  CLASS_LABELS,
  classIconUrl,
  formatNumber,
  formatPercent,
  useGameDateFormat,
  winrate,
  type ArenaStats,
} from '../../modules/playerStats/public';
import { DATA_TABLE_LABELS } from './playerStatsLabels';
import { RecentArenaGames } from './RecentGamesBlock';
import { StatsBlock } from './StatsBlock';

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

const runColumns = (formatGameDate: (timestamp: number) => string): DataTableColumn<Run>[] => [
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
  { key: 'averageWins', header: 'Средние победы', align: 'right', sortable: true, cell: row => formatNumber(row.averageWins, 2) },
  { key: 'winrate', header: 'Винрейт игр', align: 'right', sortable: true, accessor: row => winrate(row) ?? -1,
    cell: row => formatPercent(winrate(row)) },
];

const RUN_ORDER: Record<string, SortState> = {
  recent: { key: 'lastPlayedAt', direction: 'desc' },
  best: { key: 'wins', direction: 'desc' },
};

/** Arena under the header numbers: runs with their score (latest or best first) and classes. */
export function ArenaStatsView({ stats }: { stats: ArenaStats }) {
  const [sort, setSort] = useState<SortState | null>(RUN_ORDER.recent);
  const formatGameDate = useGameDateFormat();
  const runTableColumns = useMemo(() => runColumns(formatGameDate), [formatGameDate]);
  const table = { density: 'compact' as const, locale: 'ru-RU', labels: DATA_TABLE_LABELS };
  return (
    <>
      <StatsBlock title="Забеги" wide aside={(
        <SegmentedControl aria-label="Порядок забегов" size="sm" value={sort?.key === 'wins' ? 'best' : 'recent'}
          onValueChange={value => setSort(RUN_ORDER[value])}
          options={[{ value: 'recent', label: 'Последние' }, { value: 'best', label: 'Лучшие' }]} />
      )}>
        <DataTable label="Забеги" data={stats.runs} columns={runTableColumns} getRowId={run => run.runId} pageSize={10}
          sort={sort} onSortChange={setSort} {...table} />
      </StatsBlock>
      <StatsBlock title="Классы">
        <DataTable label="Классы" data={stats.classes} columns={CLASS_COLUMNS} getRowId={row => row.playerClass} {...table} />
      </StatsBlock>
      <RecentArenaGames games={stats.recentGames} />
    </>
  );
}
