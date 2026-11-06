import { useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '../../vendor/varylo-ui/basic/Button';
import type { AccountGameStatsProps } from '../../modules/identity/public';
import {
  PROFILE_STATS_TEXT,
  useGameStats,
  useGameStatsModes,
  type GlobalMmrFilter,
  type PlayerStats,
  type PlayerStatsMode,
  type ProfileStatsLang,
  type ProfileStatsText,
  type StatsPeriod,
} from '../../modules/playerStats/public';
import { ArenaStatsView } from './ArenaStatsView';
import { BattlegroundsStatsView } from './BattlegroundsStatsView';
import { ConstructedStatsView } from './ConstructedStatsView';
import { PlayerStatsEmpty } from './PlayerStatsEmpty';
import { StatsSummary } from './StatsSummary';
import '../../vendor/varylo-ui/styles/index.css';
import '../../shared/ui/varyloParchment.css';
import './PlayerStatsPanel.css';
import './ProfileStats.css';

const MODES: PlayerStatsMode[] = ['standard', 'battlegrounds', 'wild', 'arena'];

function ModeBody({ stats, filtered, mmr, onMmrChange, text }: {
  stats: PlayerStats | null;
  filtered: boolean;
  mmr: GlobalMmrFilter;
  onMmrChange: (value: GlobalMmrFilter) => void;
  text: ProfileStatsText;
}) {
  if (!stats) return <div className="profile-stats-body-skeleton" aria-hidden="true" />;
  if (stats.games === 0) return <PlayerStatsEmpty filtered={filtered} text={text} />;
  if (stats.mode === 'battlegrounds') return <BattlegroundsStatsView stats={stats} mmr={mmr} onMmrChange={onMmrChange} text={text} />;
  if (stats.mode === 'arena') return <ArenaStatsView stats={stats} />;
  return <ConstructedStatsView stats={stats} text={text} />;
}

/** One account's statistics: the header numbers and switches, and the shown mode below them. */
function PlayerStatsBody({ modes, frame, text }: {
  modes: PlayerStatsMode[];
  frame: (body: ReactNode, summary: ReactNode) => ReactNode;
  text: ProfileStatsText;
}) {
  const [mode, setMode] = useState<PlayerStatsMode>(modes[0]);
  const [period, setPeriod] = useState<StatsPeriod>('all');
  const [duos, setDuos] = useState(false);
  const [mmr, setMmr] = useState<GlobalMmrFilter>('TOP_50_PERCENT');
  const [attempt, setAttempt] = useState(0);
  const loaded = useGameStats({ mode, period, duos, mmr }, attempt);
  const busy = loaded.status === 'loading';

  const summary = (
    <StatsSummary className="hp-varylo-parchment" stats={loaded.stats} busy={busy} text={text}
      filters={{ modes, mode, period, duos, onMode: setMode, onPeriod: setPeriod, onDuos: setDuos }} />
  );
  const body = (
    <div className="player-stats-panel profile-stats hp-varylo-parchment" aria-busy={busy || undefined}>
      {loaded.status === 'error' ? (
        <div className="profile-stats__error" role="alert">
          <p>{loaded.message}</p>
          <Button variant="secondary" size="sm" leftIcon={<RotateCw size={15} aria-hidden="true" />}
            onClick={() => setAttempt(value => value + 1)}>{text.retry}</Button>
        </div>
      ) : null}
      {loaded.status === 'error' && !loaded.stats ? null : (
        <ModeBody stats={loaded.stats} filtered={period !== 'all' || duos} mmr={mmr} onMmrChange={setMmr} text={text} />
      )}
    </div>
  );
  return <>{frame(body, summary)}</>;
}

/**
 * The account's «Моя статистика» and a public profile's statistics, like
 * HSReplay's «My Stats». `frame` places the header strip (mode, period, main
 * numbers) and the mode's sections; only modes with games are offered.
 * While the modes are checked `pending` keeps the place, then `empty` is
 * shown when there is nothing.
 */
export default function PlayerStatsPanel({ frame, empty = null, pending = null, lang = 'ru' }: AccountGameStatsProps & {
  lang?: ProfileStatsLang;
}) {
  const counts = useGameStatsModes();
  if (counts === undefined) return <>{pending}</>;
  const modes = counts ? MODES.filter(mode => counts[mode] > 0) : [];
  if (!modes.length) return <>{empty}</>;
  return <PlayerStatsBody modes={modes} frame={frame} text={PROFILE_STATS_TEXT[lang]} />;
}
