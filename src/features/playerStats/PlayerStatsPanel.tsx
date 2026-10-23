import { useState } from 'react';
import { Tabs } from '../../vendor/valyro-ui/navigation/Tabs';
import { MODE_LABELS, type PlayerStatsMode } from '../../modules/playerStats/public';
import { PlayerStatsModeView } from './PlayerStatsModeView';
import '../../vendor/varylo-ui/styles/index.css';
import '../../shared/ui/varyloParchment.css';
import './PlayerStatsPanel.css';

const MODES: PlayerStatsMode[] = ['battlegrounds', 'standard', 'wild', 'arena'];

/**
 * The account's «Моя статистика» body: one tab per mode, like HSReplay's
 * «My Stats». The account section around it owns the heading; a tab loads
 * its statistics only when opened, and keeps its filters while others are shown.
 */
export default function PlayerStatsPanel({ initialMode = 'battlegrounds' }: { initialMode?: PlayerStatsMode }) {
  const [mode, setMode] = useState<PlayerStatsMode>(initialMode);
  const [opened, setOpened] = useState<Set<PlayerStatsMode>>(() => new Set([initialMode]));
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
        items={MODES.map(item => ({
          value: item,
          label: MODE_LABELS[item],
          content: opened.has(item) ? <PlayerStatsModeView mode={item} /> : null,
        }))}
      />
    </div>
  );
}
