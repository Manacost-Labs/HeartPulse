import { formatNumber } from '../model/format';
import './PlayerStatsCharts.css';

/**
 * Share of games per place, 1 to 8 (Duos 1 to 4). With `global`, a thin gold
 * bar beside each place shows the global share; `average` marks the mean place.
 */
export function PlacementBars({ counts, global, average, label, compact = false }: {
  counts: readonly number[];
  global?: readonly number[] | null;
  average?: number | null;
  label: string;
  compact?: boolean;
}) {
  const total = counts.reduce((sum, value) => sum + value, 0);
  const shares = counts.map(value => (total ? (value / total) * 100 : 0));
  const peak = Math.max(1, ...shares, ...(global ?? []));
  const describe = shares.map((share, index) => `${index + 1}-е: ${formatNumber(share, 0)}%`
    + (global?.[index] !== undefined ? ` (в среднем ${formatNumber(global[index], 0)}%)` : '')).join(', ');
  const markerPosition = average ? ((average - 0.5) / counts.length) * 100 : null;
  return (
    <figure className={`player-stats-placements${compact ? ' player-stats-placements--compact' : ''}`}
      role="img" aria-label={`${label}: ${describe}`}>
      <div className="player-stats-placements__bars">
        {shares.map((share, index) => (
          <div key={index} className="player-stats-placements__slot" data-top={index < counts.length / 2 ? 'true' : undefined}>
            <span className="player-stats-placements__own" style={{ blockSize: `${(share / peak) * 100}%` }} />
            {global?.[index] !== undefined ? (
              <span className="player-stats-placements__global" style={{ blockSize: `${(global[index] / peak) * 100}%` }} />
            ) : null}
          </div>
        ))}
        {markerPosition !== null ? <span className="player-stats-placements__average" style={{ insetInlineStart: `${markerPosition}%` }} /> : null}
      </div>
      <div className="player-stats-placements__axis" aria-hidden="true">
        {counts.map((_, index) => <span key={index}>{index + 1}</span>)}
      </div>
    </figure>
  );
}
