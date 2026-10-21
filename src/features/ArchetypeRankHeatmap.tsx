import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { RankMatrix } from './archetypeInsightsModel';
import { RANK_HEAT_LEGEND, rankHeatCell } from './archetypeRankHeatModel';
import './ArchetypeRankHeatmap.css';

const PERCENT = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
const COUNT = (value: number) => Math.round(value).toLocaleString('ru-RU');
/** Six period names do not fit a phone row: there the header shows these, the full name stays for screen readers. */
const SHORT_PERIODS: Record<string, string> = {
  past_day: '1 д', past_3_days: '3 д', past_week: '7 д', past_2_weeks: '14 д', past_30_days: '30 д', black_empire: 'Доп.',
};
const NAV: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };

function verdict(cell: ReturnType<typeof rankHeatCell>) {
  if (cell.tone === 'empty') return 'Меньше 100 игр — HSGuru не показывает этот срез.';
  if (!cell.significant) return 'Отличие от 50% в пределах погрешности.';
  return cell.tone === 'above' ? 'Уверенно выше 50%.' : 'Уверенно ниже 50%.';
}

/**
 * Winrate in every rank × period slice of HSGuru as a native table: a diverging colour around
 * 50% (see `rankHeatCell`), the rank column pinned while the periods scroll inside the card on
 * a narrow screen, and a hover/focus card with the sample and its 95% interval placed beside
 * the cell, never over it. Arrow keys move between cells.
 */
export function RankHeatmap({ matrix }: { matrix: RankMatrix }) {
  const cells = useMemo(() => {
    const byKey = new Map(matrix.cells.map(cell => [`${cell.rank}|${cell.period}`, cell]));
    return matrix.ranks.map(rank => matrix.periods.map(period => {
      const source = byKey.get(`${rank.id}|${period.id}`);
      return { winrate: source?.winrate ?? null, games: source?.games ?? null, ...rankHeatCell(source?.winrate, source?.games) };
    }));
  }, [matrix]);
  const [active, setActive] = useState<{ row: number; column: number } | null>(null);
  const [focus, setFocus] = useState({ row: 0, column: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = wrap.current;
    const element = card.current;
    const target = active && root?.querySelector<HTMLElement>(`[data-cell="${active.row}-${active.column}"]`);
    if (!root || !element || !target) return;
    const box = root.getBoundingClientRect();
    const cell = target.getBoundingClientRect();
    const above = cell.top - box.top - element.offsetHeight - 8;
    const top = above >= 0 ? above : cell.bottom - box.top + 8;
    const left = Math.max(0, Math.min(cell.left - box.left + cell.width / 2 - element.offsetWidth / 2, box.width - element.offsetWidth));
    element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }, [active]);

  if (!cells.some(row => row.some(cell => cell.tone !== 'empty'))) {
    return <p className="archetype-insight-empty">HSGuru пока не показывает этот архетип ни в одном ранге с выборкой от 100 игр.</p>;
  }
  const move = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { setActive(null); return; }
    const step = NAV[event.key];
    if (!step) return;
    event.preventDefault();
    const next = {
      row: Math.min(cells.length - 1, Math.max(0, focus.row + step[0])),
      column: Math.min(matrix.periods.length - 1, Math.max(0, focus.column + step[1])),
    };
    setFocus(next);
    wrap.current?.querySelector<HTMLElement>(`[data-cell="${next.row}-${next.column}"]`)?.focus();
  };
  const shown = active ? { cell: cells[active.row][active.column], rank: matrix.ranks[active.row].label, period: matrix.periods[active.column].label } : null;

  return <div ref={wrap} className="archetype-rank-grid">
    <div className="archetype-rank-grid__scroll" onScroll={() => setActive(null)}>
      <table>
        <caption className="sr-only">Винрейт архетипа по рангам и периодам HSGuru, с числом игр</caption>
        <thead><tr>
          <th scope="col" className="archetype-rank-grid__corner">Ранг</th>
          {matrix.periods.map(period => <th key={period.id} scope="col">
            <span className="archetype-rank-grid__full">{period.label}</span>
            <span className="archetype-rank-grid__short" aria-hidden="true">{SHORT_PERIODS[period.id] ?? period.label}</span>
          </th>)}
        </tr></thead>
        <tbody>{matrix.ranks.map((rank, row) => <tr key={rank.id}>
          <th scope="row">{rank.label}</th>
          {cells[row].map((cell, column) => <td key={matrix.periods[column].id} data-cell={`${row}-${column}`} data-tone={cell.tone}
            tabIndex={focus.row === row && focus.column === column ? 0 : -1}
            style={cell.tone === 'empty' ? undefined : { background: cell.fill, color: cell.ink }}
            onPointerEnter={event => { if (event.pointerType === 'mouse') setActive({ row, column }); }}
            onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }}
            onFocus={() => { setFocus({ row, column }); setActive({ row, column }); }}
            onBlur={() => setActive(null)} onKeyDown={move}>
            {cell.winrate === null ? <><span aria-hidden="true">—</span><span className="sr-only">нет данных</span></> : <>{cell.winrate.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}<span className="archetype-rank-grid__unit">%</span></>}
            {cell.games !== null && <span className="sr-only">, {COUNT(cell.games)} игр{cell.low !== null && cell.high !== null ? `, 95% интервал ${PERCENT(Number(cell.low.toFixed(1)))}–${PERCENT(Number(cell.high.toFixed(1)))}` : ''}</span>}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {shown && <div ref={card} className="archetype-rank-grid__card" aria-hidden="true" data-tone={shown.cell.tone}>
      <span>{shown.rank} · {shown.period}</span>
      <strong>{shown.cell.winrate === null ? 'Нет данных' : PERCENT(shown.cell.winrate)}</strong>
      {shown.cell.games !== null && <span>Игр: {COUNT(shown.cell.games)}</span>}
      {shown.cell.low !== null && shown.cell.high !== null && <span>95% интервал: {PERCENT(Number(shown.cell.low.toFixed(1)))}–{PERCENT(Number(shown.cell.high.toFixed(1)))}</span>}
      <em>{verdict(shown.cell)}</em>
    </div>}
    <div className="archetype-rank-grid__legend" aria-hidden="true">
      <span className="archetype-rank-grid__scale" style={{ background: `linear-gradient(90deg, ${RANK_HEAT_LEGEND.map(stop => stop.fill).join(', ')})` }} />
      <span className="archetype-rank-grid__ticks">{RANK_HEAT_LEGEND.map(stop => <span key={stop.winrate}>{stop.winrate === 40 ? '≤40%' : stop.winrate === 60 ? '≥60%' : `${stop.winrate}%`}</span>)}</span>
      <p>Красный — ниже 50%, зелёный — выше. Бледная клетка — мало игр: разница с 50% может быть погрешностью.</p>
    </div>
  </div>;
}
