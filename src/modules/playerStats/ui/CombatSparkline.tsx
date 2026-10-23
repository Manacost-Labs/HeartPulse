import { formatPercent } from '../model/format';
import './PlayerStatsCharts.css';

const WIDTH = 132;
const HEIGHT = 40;
const TURNS = 12;

function polyline(points: ReadonlyArray<{ turn: number; winrate: number }>): string {
  return points
    .filter(point => point.turn >= 1 && point.turn <= TURNS)
    .map(point => `${(((point.turn - 1) / (TURNS - 1)) * WIDTH).toFixed(1)},${(HEIGHT - (point.winrate / 100) * HEIGHT).toFixed(1)}`)
    .join(' ');
}

/**
 * Combat win rate on turns 1–12 on one fixed 0–100% scale, so the player's
 * line and the global one compare directly; the dashed rule is 50%.
 */
export function CombatSparkline({ own, global, label }: {
  own: ReadonlyArray<{ turn: number; winrate: number }>;
  global: ReadonlyArray<{ turn: number; winrate: number }> | null;
  label: string;
}) {
  if (!own.length) return <span className="player-stats-muted">—</span>;
  const summary = own.slice(0, TURNS).map(point => `ход ${point.turn}: ${formatPercent(point.winrate)}`).join(', ');
  return (
    <svg className="player-stats-sparkline" viewBox={`-2 -2 ${WIDTH + 4} ${HEIGHT + 4}`} width={WIDTH} height={HEIGHT}
      role="img" aria-label={`${label}: ${summary}`}>
      <line className="player-stats-sparkline__half" x1={0} x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} />
      {global?.length ? <polyline className="player-stats-sparkline__global" points={polyline(global)} /> : null}
      <polyline className="player-stats-sparkline__own" points={polyline(own)} />
    </svg>
  );
}
