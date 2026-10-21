import { Sparkline } from '../vendor/varylo-ui/charts/Sparkline';
import { standardMetaWinrateAxis, type StandardMetaWinrateEstimate } from './standardMetaTableModel';

/** A percentage with one decimal, the meta table's number format. */
export const point = (value: number) => value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const tone = (value: number) => (value >= 52 ? 'strong' : value >= 49 ? 'even' : 'weak');

/** Win rate, a bar from 50% with its 95% interval, and the change against the previous window. */
export function WinrateCell({ estimate, change }: { estimate: StandardMetaWinrateEstimate | null; change: number | null }) {
  if (!estimate) return <span className="standard-meta-table__winrate-value">—</span>;
  const { winrate, low, high } = estimate;
  const value = standardMetaWinrateAxis(winrate);
  const middle = standardMetaWinrateAxis(50);
  const interval = `95% интервал ${point(low)}–${point(high)}%`;
  return (
    <span className="standard-meta-table__winrate-cell" data-tone={tone(winrate)}>
      <strong className="standard-meta-table__winrate-value">{point(winrate)}%</strong>
      <span className="standard-meta-table__winrate-bar" title={interval} aria-hidden="true">
        <span className="standard-meta-table__winrate-interval" style={{ insetInlineStart: `${standardMetaWinrateAxis(low)}%`, inlineSize: `${standardMetaWinrateAxis(high) - standardMetaWinrateAxis(low)}%` }} />
        <span className="standard-meta-table__winrate-fill" style={{ insetInlineStart: `${Math.min(value, middle)}%`, inlineSize: `${Math.abs(value - middle)}%` }} />
      </span>
      <span className="sr-only">{interval}</span>
      {change !== null && <ChangeValue change={change} />}
    </span>
  );
}

function ChangeValue({ change }: { change: number }) {
  const rounded = Math.round(change * 10) / 10;
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : '±';
  return (
    <span className="standard-meta-table__change" data-direction={direction}>
      <span aria-hidden="true">{direction === 'up' ? '▲' : direction === 'down' ? '▼' : '•'}</span>
      <span className="sr-only">изменение </span>{sign}{point(Math.abs(rounded))}
    </span>
  );
}

export function WinrateSparkline({ winrates, buckets }: { winrates: Array<number | null> | null; buckets: string[] }) {
  const known = winrates?.filter((value): value is number => value !== null) ?? [];
  if (!winrates || known.length < 2) return <span className="standard-meta-table__no-trend" title="Мало окон с достаточной выборкой">—</span>;
  const spoken = winrates.map((value, index) => `${buckets[index] ?? ''}: ${value === null ? 'нет данных' : `${point(value)}%`}`).join(', ');
  return <Sparkline data={winrates} width={72} height={22} showDot ariaLabel={`Винрейт по окнам: ${spoken}`} />;
}
