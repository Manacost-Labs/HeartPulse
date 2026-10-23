import { ArrowDown, ArrowUp } from 'lucide-react';
import { comparison, formatNumber } from '../model/format';
import './PlayerStatsCharts.css';

/**
 * «vs Global» under a personal value: the difference with an arrow, green
 * when it is better for the player. Nothing renders without a global value.
 */
export function VsGlobal({ own, global, digits = 1, unit = '', lowerIsBetter = false }: {
  own: number | null;
  global: number | null;
  digits?: number;
  unit?: string;
  lowerIsBetter?: boolean;
}) {
  const result = comparison(own, global, lowerIsBetter);
  if (!result) return null;
  const Arrow = result.delta >= 0 ? ArrowUp : ArrowDown;
  const amount = `${formatNumber(Math.abs(result.delta), digits)}${unit}`;
  const meaning = result.tone === 'better' ? 'лучше среднего' : result.tone === 'worse' ? 'хуже среднего' : 'как в среднем';
  return (
    <span className="player-stats-vs" data-tone={result.tone} title={`В среднем по данным Hearthpulse: ${formatNumber(global, digits)}${unit}`}>
      {result.tone === 'even' ? null : <Arrow aria-hidden="true" />}
      {amount}
      <span className="player-stats-visually-hidden"> — {meaning}, в среднем по данным Hearthpulse {formatNumber(global, digits)}{unit}</span>
    </span>
  );
}
