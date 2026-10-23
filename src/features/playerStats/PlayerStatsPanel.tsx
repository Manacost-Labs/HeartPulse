import { useState } from 'react';
import { Tabs } from '../../vendor/valyro-ui/navigation/Tabs';
import type { AccountGameStatsProps } from '../../modules/identity/public';
import { MODE_LABELS, useGameStatsModes, type PlayerStatsMode } from '../../modules/playerStats/public';
import { PlayerStatsModeView } from './PlayerStatsModeView';
import '../../vendor/varylo-ui/styles/index.css';
import '../../shared/ui/varyloParchment.css';
import './PlayerStatsPanel.css';

const MODES: PlayerStatsMode[] = ['battlegrounds', 'standard', 'wild', 'arena'];

/** The tabs of one account with statistics; a tab loads only when opened and keeps its filters. */
function PlayerStatsTabs({ modes }: { modes: PlayerStatsMode[] }) {
  const [mode, setMode] = useState<PlayerStatsMode>(modes[0]);
  const [opened, setOpened] = useState<Set<PlayerStatsMode>>(() => new Set([modes[0]]));
  return (
    <div className="player-stats-panel hp-varylo-parchment">
      <Tabs
        label="Режим"
        value={mode}
        onValueChange={value => {
          const next = value as PlayerStatsMode;
          setMode(next);
          setOpened(previous => (previous.has(next) ? previous : new Set(previous).add(next)));
        }}
        items={modes.map(item => ({
          value: item,
          label: MODE_LABELS[item],
          content: opened.has(item) ? <PlayerStatsModeView mode={item} /> : null,
        }))}
      />
    </div>
  );
}

/**
 * The account's «Моя статистика», like HSReplay's «My Stats». Until the
 * desktop tracker has sent version 2 events (or while the statistics are
 * switched off on the server) nothing is rendered: no empty section and no
 * call to install an application that does not send games yet. Only modes
 * with events get a tab.
 */
export default function PlayerStatsPanel({ frame }: AccountGameStatsProps) {
  const counts = useGameStatsModes();
  const modes = counts ? MODES.filter(mode => counts[mode] > 0) : [];
  if (!modes.length) return null;
  return <>{frame(<PlayerStatsTabs modes={modes} />)}</>;
}
