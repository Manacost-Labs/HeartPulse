import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '../../vendor/varylo-ui/basic/Button';
import { KpiGroup } from '../../vendor/varylo-ui/data-display/KpiGroup';
import { SegmentedControl } from '../../vendor/varylo-ui/navigation/SegmentedControl';
import {
  PERIOD_OPTIONS,
  hasStats,
  useGameStats,
  type GameStatsState,
  type GlobalMmrFilter,
  type PlayerStatsMode,
  type StatsPeriod,
} from '../../modules/playerStats/public';
import { ArenaStatsView } from './ArenaStatsView';
import { BattlegroundsStatsView } from './BattlegroundsStatsView';
import { ConstructedStatsView } from './ConstructedStatsView';
import { PlayerStatsEmpty } from './PlayerStatsEmpty';

/** The ready answer of one mode, or its empty state; no answer yet shows the KPI skeleton. */
function ModeBody({ stats, loading, filtered, mmr, onMmrChange }: {
  stats: GameStatsState['stats'];
  loading: boolean;
  filtered: boolean;
  mmr: GlobalMmrFilter;
  onMmrChange: (value: GlobalMmrFilter) => void;
}) {
  if (!stats) return loading ? <KpiGroup items={[]} loading skeletonCount={4} /> : null;
  if (!hasStats(stats)) return <PlayerStatsEmpty filtered={filtered} />;
  if (stats.mode === 'battlegrounds') return <BattlegroundsStatsView stats={stats} mmr={mmr} onMmrChange={onMmrChange} />;
  if (stats.mode === 'arena') return <ArenaStatsView stats={stats} />;
  return <ConstructedStatsView stats={stats} />;
}

/** Filters, loading and failure of one mode; the mode views render a ready answer. */
export function PlayerStatsModeView({ mode }: { mode: PlayerStatsMode }) {
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const [duos, setDuos] = useState(false);
  const [mmr, setMmr] = useState<GlobalMmrFilter>('TOP_50_PERCENT');
  const [attempt, setAttempt] = useState(0);
  const loaded = useGameStats({ mode, period, duos, mmr }, attempt);

  return (
    <div className="player-stats-mode" aria-busy={loaded.status === 'loading' || undefined}>
      <div className="player-stats-mode__filters">
        {mode === 'battlegrounds' ? (
          <SegmentedControl aria-label="Формат" size="sm" value={duos ? 'duos' : 'solo'}
            onValueChange={value => setDuos(value === 'duos')}
            options={[{ value: 'solo', label: 'Соло' }, { value: 'duos', label: 'Дуо' }]} />
        ) : null}
        <SegmentedControl aria-label="Период" size="sm" value={period}
          onValueChange={value => setPeriod(value as StatsPeriod)} options={PERIOD_OPTIONS} />
      </div>
      {loaded.status === 'error' ? (
        <div className="player-stats-mode__error" role="alert">
          <p>{loaded.message}</p>
          <Button variant="secondary" size="sm" leftIcon={<RotateCw size={15} aria-hidden="true" />}
            onClick={() => setAttempt(value => value + 1)}>Повторить</Button>
        </div>
      ) : null}
      <ModeBody stats={loaded.stats} loading={loaded.status === 'loading'} filtered={period !== 'all' || duos}
        mmr={mmr} onMmrChange={setMmr} />
    </div>
  );
}
