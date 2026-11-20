import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Search } from 'lucide-react';
import type { PublicStandardMatchups, PublicStandardMatchupsArchetype } from '../modules/standardMatchups/public';
import {
  MATCHUP_SORTS, matchesArchetype, matchupBand, matchupOrder, shortArchetypeLabel, type MatchupBand, type MatchupSortKey,
} from './standardMatchupsOpenModel';

/** A pair with fewer games than this is muted: its rate is a rough guess. */
const SOLID_GAMES = 100;
/** Cells start after the row's name and its total. */
const FIRST_CELL = 2;
const BAND_TEXT: Record<MatchupBand, string> = { ss: 'Выгодно', s: 'Выгодно', e: 'Ровно', w: 'Невыгодно', ww: 'Невыгодно' };

type Active = { row: number; col: number };

const classIcon = (classKey: string | null) => classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';

function ClassIcon({ classKey }: { classKey: string | null }) {
  return <img className="standard-matchups-open__icon" src={classIcon(classKey)} alt="" width={20} height={20} decoding="async" />;
}

/** Arrows, Home and End move between the cells; on the region itself an arrow enters the first cell. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!/^(Arrow(Up|Down|Left|Right)|Home|End)$/.test(event.key)) return;
  const body = event.currentTarget.querySelector('tbody');
  if (!body) return;
  const current = (event.target as HTMLElement).closest('td');
  if (!(current instanceof HTMLTableCellElement) || current.cellIndex < FIRST_CELL) {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    body.rows[0]?.cells[FIRST_CELL]?.focus();
    return;
  }
  const rowPos = (current.parentElement as HTMLTableRowElement).sectionRowIndex;
  const last = body.rows[rowPos].cells.length - 1;
  const cellPos = event.key === 'ArrowLeft' ? current.cellIndex - 1 : event.key === 'ArrowRight' ? current.cellIndex + 1
    : event.key === 'Home' ? FIRST_CELL : event.key === 'End' ? last : current.cellIndex;
  const nextRow = event.key === 'ArrowUp' ? rowPos - 1 : event.key === 'ArrowDown' ? rowPos + 1 : rowPos;
  const next = body.rows[Math.max(0, Math.min(body.rows.length - 1, nextRow))]
    ?.cells[Math.max(FIRST_CELL, Math.min(last, cellPos))];
  event.preventDefault();
  next?.focus();
}

function MatrixTable({ archetypes, pairs, order, rows, live }: {
  archetypes: PublicStandardMatchupsArchetype[]; pairs: PublicStandardMatchups['pairs']; order: number[]; rows: number[]; live: boolean;
}) {
  return (
    <table className="standard-matchups-open__matrix">
      <caption className="sr-only">
        Винрейт архетипа по строке против архетипа по столбцу, % побед. Показаны {archetypes.length} самых популярных архетипов.
      </caption>
      <thead>
        <tr>
          <th scope="col" className="standard-matchups-open__corner">Архетип</th>
          <th scope="col" className="standard-matchups-open__total">Винрейт</th>
          {order.map(index => {
            const column = archetypes[index];
            return (
              <th key={column.name} scope="col" className="standard-matchups-open__column" title={column.label}
                data-class={column.classKey ?? undefined}>
                <span className="standard-matchups-open__colhead">
                  <span className="standard-matchups-open__colname">{shortArchetypeLabel(column.label, column.classKey)}</span>
                  <ClassIcon classKey={column.classKey} />
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map(rowIndex => {
          const row = archetypes[rowIndex];
          return (
            <tr key={row.name}>
              <th scope="row" className="standard-matchups-open__row" title={row.label} data-class={row.classKey ?? undefined}>
                <ClassIcon classKey={row.classKey} />
                <span>{row.label}</span>
                <small>{[row.popularity, row.games ? `${row.games.toLocaleString('ru-RU')} игр` : null].filter(Boolean).join(' · ')}</small>
              </th>
              <td className="standard-matchups-open__total">{row.winrate === null ? '—' : row.winrate.toFixed(1)}</td>
              {order.map(columnIndex => {
                const pair = pairs[rowIndex][columnIndex];
                return (
                  <td key={archetypes[columnIndex].name} data-b={matchupBand(pair)} tabIndex={live ? -1 : undefined}
                    data-l={pair && pair.games < SOLID_GAMES ? '' : undefined}>
                    {pair && pair.winrate !== null ? pair.winrate.toFixed(1) : '—'}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Hover and focus mark the cell's row and column by attributes set on the live nodes: a state change here would
 * re-render every one of the hundreds of cells on each pointer move.
 */
const MatrixGrid = memo(function MatrixGrid({ archetypes, pairs, order, rows, live, onActive }: {
  archetypes: PublicStandardMatchupsArchetype[]; pairs: PublicStandardMatchups['pairs']; order: number[]; rows: number[];
  live: boolean; onActive: (cell: Active | null) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const marked = useRef<Element[]>([]);
  const at = useRef<string>('');

  const clear = useCallback(() => {
    for (const node of marked.current) { node.removeAttribute('data-hr'); node.removeAttribute('data-hc'); node.removeAttribute('data-ha'); }
    marked.current = [];
    at.current = '';
    scroller.current?.querySelector('table')?.removeAttribute('data-hot');
  }, []);

  /** `rowPos` / `colPos` are positions in the shown table; `null` marks only the other axis. */
  const mark = useCallback((rowPos: number | null, colPos: number | null) => {
    const table = scroller.current?.querySelector('table');
    if (!table) return;
    const key = `${rowPos}:${colPos}`;
    if (key === at.current) return;
    clear();
    at.current = key;
    const body = table.tBodies[0];
    const touched: Element[] = [];
    const flag = (node: Element | undefined, name: string) => { if (node) { node.setAttribute(name, ''); touched.push(node); } };
    if (rowPos !== null) for (const cell of Array.from(body.rows[rowPos]?.cells ?? [])) flag(cell, 'data-hr');
    if (colPos !== null) {
      flag(table.tHead?.rows[0]?.cells[colPos + FIRST_CELL], 'data-hc');
      for (const row of Array.from(body.rows)) flag(row.cells[colPos + FIRST_CELL], 'data-hc');
    }
    if (rowPos !== null && colPos !== null) flag(body.rows[rowPos]?.cells[colPos + FIRST_CELL], 'data-ha');
    marked.current = touched;
    table.setAttribute('data-hot', '');
  }, [clear]);

  // A new slice or order replaces the nodes the marks sit on.
  useEffect(() => { clear(); onActive(null); }, [archetypes, order, rows, clear, onActive]);

  const locate = (target: EventTarget | null) => {
    const node = (target as HTMLElement | null)?.closest?.('td, th');
    if (!(node instanceof HTMLTableCellElement)) return null;
    const section = node.parentElement?.parentElement?.tagName;
    const cell = node.cellIndex >= FIRST_CELL ? node.cellIndex - FIRST_CELL : null;
    if (section === 'THEAD') return cell === null ? null : { rowPos: null, colPos: cell };
    const rowPos = (node.parentElement as HTMLTableRowElement).sectionRowIndex;
    return { rowPos, colPos: cell };
  };
  const show = (target: EventTarget | null) => {
    const spot = locate(target);
    if (!spot) return;
    mark(spot.rowPos, spot.colPos);
    onActive(spot.rowPos !== null && spot.colPos !== null ? { row: rows[spot.rowPos], col: order[spot.colPos] } : null);
  };
  const leave = () => { clear(); onActive(null); };

  return (
    <div ref={scroller} className="standard-matchups-open__scroll" role="region" aria-label="Матрица матчапов"
      tabIndex={live ? 0 : undefined} onKeyDown={moveFocus}
      onPointerOver={(event: PointerEvent) => show(event.target)}
      onPointerLeave={(event: PointerEvent) => { if (event.pointerType === 'mouse') leave(); }}
      onFocus={event => show(event.target)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) leave(); }}>
      <MatrixTable archetypes={archetypes} pairs={pairs} order={order} rows={rows} live={live} />
    </div>
  );
});

function Readout({ data, active }: { data: PublicStandardMatchups; active: Active | null }) {
  const pair = active ? data.pairs[active.row]?.[active.col] ?? null : null;
  const names = active && data.archetypes[active.row] && data.archetypes[active.col]
    ? [data.archetypes[active.row].label, data.archetypes[active.col].label] : null;
  const band = matchupBand(pair);
  return (
    <p className="standard-matchups-open__readout" role="status" aria-live="polite" data-b={band}>
      {names ? (
        <>
          <span className="standard-matchups-open__readout-names">{names[0]} <i>против</i> {names[1]}</span>
          {pair && pair.winrate !== null ? (
            <>
              <strong>{pair.winrate.toFixed(1)}%</strong>
              <span>{band ? BAND_TEXT[band] : ''} · {pair.games.toLocaleString('ru-RU')} игр{pair.games < SOLID_GAMES ? ' · мало игр' : ''}</span>
            </>
          ) : <span>нет данных: мало игр в паре</span>}
        </>
      ) : <span className="standard-matchups-open__readout-hint">Наведите на клетку или выберите её</span>}
    </p>
  );
}

/** The open matrix with what a reader needs to find a matchup: search, order, a readout of the cell under the pointer. */
export function OpenMatrix({ data, busy }: { data: PublicStandardMatchups; busy: boolean }) {
  const { archetypes, pairs } = data;
  const [sort, setSort] = useState<{ key: MatchupSortKey; reverse: boolean }>({ key: 'popularity', reverse: false });
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Active | null>(null);
  const [live, setLive] = useState(false);
  // The server prints a plain table; the cells become focusable only once the browser can handle the keys.
  useEffect(() => setLive(true), []);

  const order = useMemo(() => matchupOrder(archetypes, sort.key, sort.reverse), [archetypes, sort]);
  const rows = useMemo(() => order.filter(index => matchesArchetype(archetypes[index], query)), [archetypes, order, query]);
  const choose = (key: MatchupSortKey) => setSort(current => ({ key, reverse: current.key === key && !current.reverse }));
  const onActive = useCallback((cell: Active | null) => setActive(cell), []);

  return (
    <div className="standard-matchups-open__matrix-block" aria-busy={busy}>
      <div className="standard-matchups-open__tools">
        <label className="standard-matchups-open__search">
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти архетип"
            aria-label="Найти архетип" autoComplete="off" enterKeyHint="search" />
        </label>
        <div className="standard-matchups__segmented standard-matchups-open__sorts" role="group" aria-label="Порядок архетипов">
          {MATCHUP_SORTS.map(([key, name]) => (
            <button key={key} type="button" aria-pressed={sort.key === key} onClick={() => choose(key)}>
              {name}{sort.key === key ? <span aria-hidden="true">{(key === 'name') === sort.reverse ? ' ↓' : ' ↑'}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <Readout data={data} active={active} />
      {rows.length ? (
        <MatrixGrid archetypes={archetypes} pairs={pairs} order={order} rows={rows} live={live} onActive={onActive} />
      ) : <div className="standard-matchups-open__none">Такого архетипа нет среди {archetypes.length} самых популярных.</div>}
    </div>
  );
}
