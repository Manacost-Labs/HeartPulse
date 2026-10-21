'use client';

import {
  createElement,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx, getDirection, inlineArrowStep, useControllableState } from '../primitives';
import { Select } from '../forms/Select';
import { useLocale } from '../theme/ThemeProvider';
import { useLabels } from '../agents/labels';
import type { GameImageSource, GameRole } from './game';
import { GameImage } from './picture';
import { fieldWinRate, matchupLookup, type Matchup, type MatchupCell } from './stats';
import './MatchupMatrix.css';

export interface MatchupChampion {
  id: string;
  name: string;
  /** Portrait: an image URL or a node. Without it, the initials on the role colour. */
  image?: GameImageSource;
  /** Role id from `roles`: tints the portrait fallback and is read after the name. */
  role?: string;
  /** How often it is met (any scale): weights the win rate against the field. */
  share?: number;
}

export interface MatchupMatrixLabels {
  title: string;
  /** Name of the champion picker. */
  picker: string;
  /** Corner cell: rows are the champions, columns the opponents. */
  corner: string;
  overall: string;
  /** Lead of the summary's best matchups. */
  best: string;
  /** Lead of the summary's worst matchups. */
  worst: string;
  /** Heading of the narrow-screen list. */
  listTitle: (champion: string) => string;
  /** Accessible name of a cell. */
  cell: (champion: string, opponent: string, rate: string, games: string) => string;
  noData: (champion: string, opponent: string) => string;
  /** A champion against itself with no games of its own: even by definition. */
  mirror: (champion: string) => string;
  /** Accessible name of a field cell. */
  overallCell: (champion: string, rate: string) => string;
  /** The two names in the tooltip. */
  versus: (champion: string, opponent: string) => string;
  games: (count: string) => string;
  lowSample: string;
  favoured: string;
  unfavoured: string;
  even: string;
  better: string;
  worse: string;
  /** Detail line when nothing is focused. */
  pick: string;
  instructions: string;
}

const DEFAULT_LABELS: MatchupMatrixLabels = {
  title: 'Matchups',
  picker: 'Your champion',
  corner: 'Champion vs',
  overall: 'Vs field',
  best: 'Best against',
  worst: 'Worst against',
  listTitle: (champion) => `${champion} against`,
  cell: (champion, opponent, rate, games) => `${champion} against ${opponent}: ${rate}, ${games}`,
  noData: (champion, opponent) => `${champion} against ${opponent}: no data`,
  mirror: (champion) => `${champion} mirror match: even by definition`,
  overallCell: (champion, rate) => `${champion} against the field: ${rate}`,
  versus: (champion, opponent) => `${champion} vs ${opponent}`,
  games: (count) => `${count} games`,
  lowSample: 'few games',
  favoured: 'Favoured',
  unfavoured: 'Unfavoured',
  even: 'Even',
  better: 'Better',
  worse: 'Worse',
  pick: 'Hover or move through the grid to read a matchup.',
  instructions: 'Arrow keys move between cells; Home and End go to the ends of a row. A row name picks that champion.',
};

export interface MatchupMatrixProps extends Omit<ComponentPropsWithRef<'section'>, 'title' | 'children'> {
  /** Champions, in the order of the rows. */
  champions: MatchupChampion[];
  /** Win rates of row champions against column champions; a missing pairing is read from its mirror. */
  matchups: Matchup[];
  /** Ids of the column champions. Default: every champion. */
  opponents?: string[];
  /** Roles of the champions: portrait fallbacks take their colour. */
  roles?: GameRole[];
  /** Id of the reader's champion: its row is marked, the summary and the narrow-screen list are about it. */
  selected?: string;
  /** Initial champion when uncontrolled. Default: the first. */
  defaultSelected?: string;
  /** Called when the reader picks a champion. */
  onSelectedChange?: (id: string) => void;
  /** Fewer games than this: hatched and marked. Default 50. */
  minGames?: number;
  /** Win-rate distance from 50% that gets the full colour. Default 0.08. */
  spread?: number;
  /** Adds the win rate against the field, weighted by `share`. Default true. */
  showOverall?: boolean;
  /** Called when a cell is clicked or Enter is pressed on it. */
  onCellClick?: (champion: MatchupChampion, opponent: MatchupChampion, cell: MatchupCell | undefined) => void;
  /** Heading. Default: `labels.title`. */
  title?: ReactNode;
  /** Line under the heading: patch, rank, sample. */
  subtitle?: ReactNode;
  /** Level of the heading (default 3). */
  headingLevel?: 2 | 3 | 4 | 5;
  /** BCP 47 locale for numbers; defaults to the ThemeProvider's. */
  locale?: string;
  labels?: Partial<MatchupMatrixLabels>;
}

type Active = { row: number; col: number };

const ROW_PORTRAIT = 24;
const HEAD_PORTRAIT = 28;

/**
 * Counters at a glance: every champion against every other as a heat map — green favours the row, red the column,
 * hatching marks thin samples — with a tooltip per cell. Pick your champion to mark its row and read its best and
 * worst matchups; on a narrow screen the grid becomes a list of its matchups. The grid is read cell by cell with the
 * arrow keys, and the focused or hovered matchup is spelled out under it.
 */
export function MatchupMatrix({
  champions,
  matchups,
  opponents: opponentIds,
  roles,
  selected: selectedProp,
  defaultSelected,
  onSelectedChange,
  minGames = 50,
  spread = 0.08,
  showOverall = true,
  onCellClick,
  title,
  subtitle,
  headingLevel = 3,
  locale: localeProp,
  labels,
  className,
  ref,
  ...rest
}: MatchupMatrixProps) {
  const locale = useLocale(localeProp);
  const copy = useLabels(DEFAULT_LABELS, labels);
  const uid = useId();
  const [selectedState, setSelected] = useControllableState({ value: selectedProp, defaultValue: defaultSelected ?? champions[0]?.id ?? '', onChange: onSelectedChange });
  const [active, setActive] = useState<Active>({ row: 0, col: 0 });
  const [hover, setHover] = useState<Active | null>(null);
  const [focused, setFocused] = useState(false);
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const tipRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const roleById = useMemo(() => new Map((roles ?? []).map((r) => [r.id, r])), [roles]);
  const columns = useMemo(
    () => (opponentIds ? opponentIds.map((id) => byId.get(id)).filter((c): c is MatchupChampion => !!c) : champions),
    [opponentIds, champions, byId],
  );
  const lookup = useMemo(() => matchupLookup(matchups), [matchups]);
  const share = useMemo(() => (champions.some((c) => c.share !== undefined) ? Object.fromEntries(champions.map((c) => [c.id, c.share ?? 0])) : undefined), [champions]);
  const overall = useMemo(
    () => new Map(champions.map((c) => [c.id, fieldWinRate(c.id, columns.map((o) => o.id), lookup, share)])),
    [champions, columns, lookup, share],
  );
  const formats = useMemo(() => {
    const short = new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const int = new Intl.NumberFormat(locale);
    return { pct: (n: number) => short.format(n), int: (n: number) => int.format(n) };
  }, [locale]);

  const selected = byId.has(selectedState) ? selectedState : (champions[0]?.id ?? '');
  const selectedRow = champions.findIndex((c) => c.id === selected);
  const me = champions[selectedRow];

  /** Matchups of the selected champion with data, worst first. */
  const list = useMemo(() => {
    if (!me) return [];
    return columns
      .filter((o) => o.id !== me.id)
      .map((o) => ({ opponent: o, cell: lookup(me.id, o.id) }))
      .filter((m): m is { opponent: MatchupChampion; cell: MatchupCell } => !!m.cell && m.cell.games > 0)
      .sort((a, b) => a.cell.winRate - b.cell.winRate);
  }, [me, columns, lookup]);
  const reliable = list.filter((m) => m.cell.games >= minGames);
  const worst = reliable.filter((m) => m.cell.winRate < 0.495).slice(0, 3);
  const best = reliable.filter((m) => m.cell.winRate > 0.505).slice(-3).reverse();

  const colCount = columns.length + (showOverall ? 1 : 0);
  const at = { row: Math.min(active.row, champions.length - 1), col: Math.min(active.col, colCount - 1) };
  /** The cell being read: hovered, else focused; nothing lights up until the reader points at the grid. */
  const shown = hover ?? (focused ? at : null);
  const tipCell = shown;

  // Square-root ramp: small edges (51–52%) already read as a colour, big ones saturate.
  const tone = (rate: number): CSSProperties => {
    const v = Math.max(-1, Math.min(1, (rate - 0.5) / spread));
    return { '--_mix': Math.sqrt(Math.abs(v)).toFixed(3) } as CSSProperties;
  };
  const side = (rate: number) => (rate > 0.505 ? 'up' : rate < 0.495 ? 'down' : 'even');
  const verdict = (rate: number) => (side(rate) === 'up' ? copy.favoured : side(rate) === 'down' ? copy.unfavoured : copy.even);
  const colorOf = (c: MatchupChampion) => (c.role ? roleById.get(c.role)?.color : undefined);

  const describe = ({ row, col }: Active): string => {
    const champion = champions[row];
    if (!champion) return copy.pick;
    if (col >= columns.length) {
      const field = overall.get(champion.id);
      return field ? `${copy.overallCell(champion.name, formats.pct(field.winRate))}. ${verdict(field.winRate)}.` : copy.noData(champion.name, copy.overall);
    }
    const opponent = columns[col];
    const cell = lookup(champion.id, opponent.id);
    if (cell && cell.games === 0 && champion.id === opponent.id) return copy.mirror(champion.name);
    if (!cell || cell.games === 0) return copy.noData(champion.name, opponent.name);
    const base = copy.cell(champion.name, opponent.name, formats.pct(cell.winRate), copy.games(formats.int(cell.games)));
    return `${base}. ${verdict(cell.winRate)}${cell.games < minGames ? `, ${copy.lowSample}` : ''}.`;
  };

  // The tooltip sits above the hovered or focused cell, inside the scrolling box so it scrolls with the grid.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const cell = tipCell ? cellRefs.current.get(`${tipCell.row}:${tipCell.col}`) : undefined;
    if (!cell) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    const box = tip.offsetParent as HTMLElement | null;
    const left = cell.offsetLeft + cell.offsetWidth / 2;
    const width = tip.offsetWidth;
    const min = (box?.scrollLeft ?? 0) + width / 2 + 4;
    const max = (box ? box.scrollLeft + box.clientWidth : left + width) - width / 2 - 4;
    tip.style.left = `${Math.max(min, Math.min(max, left))}px`;
    const above = cell.offsetTop - tip.offsetHeight - 6;
    tip.style.top = `${above < (box?.scrollTop ?? 0) ? cell.offsetTop + cell.offsetHeight + 6 : above}px`;
  });

  const focusCell = (next: Active) => {
    setActive(next);
    cellRefs.current.get(`${next.row}:${next.col}`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableCellElement>, row: number, col: number) => {
    const step = inlineArrowStep(event.key, getDirection(event.currentTarget));
    let next: Active | null = null;
    if (step) next = { row, col: Math.min(colCount - 1, Math.max(0, col + step)) };
    else if (event.key === 'ArrowDown') next = { row: Math.min(champions.length - 1, row + 1), col };
    else if (event.key === 'ArrowUp') next = { row: Math.max(0, row - 1), col };
    else if (event.key === 'Home') next = event.ctrlKey ? { row: 0, col: 0 } : { row, col: 0 };
    else if (event.key === 'End') next = event.ctrlKey ? { row: champions.length - 1, col: colCount - 1 } : { row, col: colCount - 1 };
    else if ((event.key === 'Enter' || event.key === ' ') && onCellClick && col < columns.length) {
      event.preventDefault();
      onCellClick(champions[row], columns[col], lookup(champions[row].id, columns[col].id));
      return;
    }
    if (!next) return;
    event.preventDefault();
    focusCell(next);
  };

  const cellProps = (row: number, col: number) => ({
    ref: (node: HTMLTableCellElement | null) => {
      if (!node) return;
      const key = `${row}:${col}`;
      cellRefs.current.set(key, node);
      return () => {
        if (cellRefs.current.get(key) === node) cellRefs.current.delete(key);
      };
    },
    role: 'gridcell',
    tabIndex: row === at.row && col === at.col ? 0 : -1,
    'data-row-active': shown?.row === row || undefined,
    'data-col-active': shown?.col === col || undefined,
    onFocus: () => {
      setActive({ row, col });
      setFocused(true);
    },
    onBlur: () => setFocused(false),
    onPointerEnter: () => setHover({ row, col }),
    onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => onKeyDown(event, row, col),
  });

  const portrait = (c: MatchupChampion, size: number, alt = '') => <GameImage src={c.image} alt={alt} name={c.name} color={colorOf(c)} size={size} />;
  const chip = (m: { opponent: MatchupChampion; cell: MatchupCell }) => (
    <li key={m.opponent.id} className="ui-matchup-matrix__chip" data-side={side(m.cell.winRate)}>
      {portrait(m.opponent, 28)}
      <span className="ui-matchup-matrix__chip-text">
        <span className="ui-matchup-matrix__chip-name">{m.opponent.name}</span>
        <span className="ui-matchup-matrix__chip-rate">{formats.pct(m.cell.winRate)}</span>
      </span>
    </li>
  );

  const tip = tipCell ? describeTip(tipCell) : null;
  function describeTip({ row, col }: Active) {
    const champion = champions[row];
    if (!champion) return null;
    if (col >= columns.length) {
      const field = overall.get(champion.id);
      return { names: `${champion.name} · ${copy.overall}`, rate: field ? formats.pct(field.winRate) : '—', meta: field ? verdict(field.winRate) : '', side: field ? side(field.winRate) : 'none' };
    }
    const opponent = columns[col];
    const cell = lookup(champion.id, opponent.id);
    const mirror = champion.id === opponent.id;
    if (!cell || (cell.games === 0 && !mirror)) return { names: copy.versus(champion.name, opponent.name), rate: '—', meta: copy.noData(champion.name, opponent.name), side: 'none' };
    if (mirror && cell.games === 0) return { names: copy.versus(champion.name, opponent.name), rate: formats.pct(0.5), meta: copy.even, side: 'even' };
    const low = cell.games < minGames ? ` · ${copy.lowSample}` : '';
    return { names: copy.versus(champion.name, opponent.name), rate: formats.pct(cell.winRate), meta: `${copy.games(formats.int(cell.games))} · ${verdict(cell.winRate)}${low}`, side: side(cell.winRate) };
  }

  const heading = createElement(`h${headingLevel}`, { className: 'ui-matchup-matrix__title', id: `${uid}-title` }, title ?? copy.title);
  const meField = me ? overall.get(me.id) : undefined;

  return (
    <section ref={ref} className={cx('ui-matchup-matrix', 'ui-panel', className)} aria-labelledby={`${uid}-title`} {...rest}>
      <header className="ui-matchup-matrix__header">
        <div className="ui-matchup-matrix__heading">
          {heading}
          {subtitle && <p className="ui-matchup-matrix__subtitle">{subtitle}</p>}
        </div>
        {champions.length > 1 && (
          <Select
            className="ui-matchup-matrix__picker"
            size="sm"
            aria-label={copy.picker}
            value={selected}
            onValueChange={setSelected}
            options={champions.map((c) => ({ value: c.id, label: c.name, icon: portrait(c, 20) }))}
          />
        )}
      </header>

      {me && (
        <div className="ui-matchup-matrix__summary">
          <div className="ui-matchup-matrix__me">
            {portrait(me, 44)}
            <div className="ui-matchup-matrix__me-text">
              <span className="ui-matchup-matrix__me-name">{me.name}</span>
              {meField && (
                <span className="ui-matchup-matrix__me-field">
                  {copy.overall} <strong data-side={side(meField.winRate)}>{formats.pct(meField.winRate)}</strong>
                </span>
              )}
            </div>
          </div>
          {best.length > 0 && (
            <div className="ui-matchup-matrix__group">
              <span className="ui-matchup-matrix__group-title">{copy.best}</span>
              <ul className="ui-matchup-matrix__chips">{best.map(chip)}</ul>
            </div>
          )}
          {worst.length > 0 && (
            <div className="ui-matchup-matrix__group">
              <span className="ui-matchup-matrix__group-title">{copy.worst}</span>
              <ul className="ui-matchup-matrix__chips">{worst.map(chip)}</ul>
            </div>
          )}
        </div>
      )}

      <div className="ui-matchup-matrix__wide">
        <div className="ui-matchup-matrix__scroll" onPointerLeave={() => setHover(null)}>
          <table className="ui-matchup-matrix__grid" role="grid" aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-help`}>
            <thead>
              <tr>
                <th scope="col" className="ui-matchup-matrix__corner">
                  <span>{copy.corner}</span>
                </th>
                {columns.map((c, col) => (
                  <th key={c.id} scope="col" className="ui-matchup-matrix__colhead" data-col-active={shown?.col === col || undefined} title={c.name}>
                    {portrait(c, HEAD_PORTRAIT)}
                    <span className="ui-sr-only">{c.name}</span>
                  </th>
                ))}
                {showOverall && (
                  <th scope="col" className="ui-matchup-matrix__colhead" data-overall="" data-col-active={shown?.col === columns.length || undefined}>
                    <span className="ui-matchup-matrix__overall">{copy.overall}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {champions.map((champion, row) => {
                const field = overall.get(champion.id);
                const mine = row === selectedRow;
                return (
                  <tr key={champion.id} data-selected={mine || undefined}>
                    <th scope="row" className="ui-matchup-matrix__rowhead" data-row-active={shown?.row === row || undefined}>
                      <button type="button" className="ui-matchup-matrix__pick" aria-pressed={mine} onClick={() => setSelected(champion.id)}>
                        {portrait(champion, ROW_PORTRAIT)}
                        <span className="ui-matchup-matrix__name">{champion.name}</span>
                      </button>
                    </th>
                    {columns.map((opponent, col) => {
                      const cell = lookup(champion.id, opponent.id);
                      const mirror = champion.id === opponent.id;
                      const empty = !cell || (cell.games === 0 && !mirror);
                      return (
                        <td
                          key={opponent.id}
                          {...cellProps(row, col)}
                          className="ui-matchup-matrix__cell"
                          aria-label={describe({ row, col })}
                          data-side={empty ? 'none' : mirror && cell.games === 0 ? 'even' : side(cell.winRate)}
                          data-mirror={mirror || undefined}
                          data-low-sample={!empty && !mirror && cell.games < minGames ? true : undefined}
                          data-clickable={onCellClick ? true : undefined}
                          style={empty ? undefined : tone(cell.winRate)}
                          onClick={onCellClick ? () => onCellClick(champion, opponent, cell) : undefined}
                        >
                          <span aria-hidden="true">{empty || (mirror && cell.games === 0) ? '·' : formats.pct(cell.winRate).replace(/\s?%$/, '')}</span>
                        </td>
                      );
                    })}
                    {showOverall && (
                      <td
                        {...cellProps(row, columns.length)}
                        className="ui-matchup-matrix__cell"
                        data-overall=""
                        aria-label={describe({ row, col: columns.length })}
                        data-side={field ? side(field.winRate) : 'none'}
                        style={field ? tone(field.winRate) : undefined}
                      >
                        <span aria-hidden="true">{field ? formats.pct(field.winRate) : '·'}</span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div ref={tipRef} className="ui-matchup-matrix__tip" aria-hidden="true" hidden data-side={tip?.side}>
            {tip && (
              <>
                <span className="ui-matchup-matrix__tip-names">{tip.names}</span>
                <span className="ui-matchup-matrix__tip-rate">{tip.rate}</span>
                {tip.meta && <span className="ui-matchup-matrix__tip-meta">{tip.meta}</span>}
              </>
            )}
          </div>
        </div>
        <footer className="ui-matchup-matrix__footer">
          <p className="ui-matchup-matrix__details">{shown ? describe(shown) : copy.pick}</p>
          <span className="ui-matchup-matrix__legend" aria-hidden="true">
            <span>{copy.worse}</span>
            <span className="ui-matchup-matrix__ramp">
              <span>{formats.pct(0.5 - spread)}</span>
              <span>{formats.pct(0.5)}</span>
              <span>{formats.pct(0.5 + spread)}</span>
            </span>
            <span>{copy.better}</span>
          </span>
        </footer>
        <p id={`${uid}-help`} className="ui-sr-only">
          {copy.instructions}
        </p>
      </div>

      {me && (
        <div className="ui-matchup-matrix__narrow">
          <p className="ui-matchup-matrix__list-title">{copy.listTitle(me.name)}</p>
          <ul className="ui-matchup-matrix__list">
            {list.map(({ opponent, cell }) => {
              const low = cell.games < minGames;
              const offset = Math.max(-1, Math.min(1, (cell.winRate - 0.5) / spread)) * 50;
              return (
                <li key={opponent.id} className="ui-matchup-matrix__item" data-side={side(cell.winRate)} data-low-sample={low || undefined}>
                  {portrait(opponent, 32)}
                  <span className="ui-matchup-matrix__item-text">
                    <span className="ui-matchup-matrix__item-name">{opponent.name}</span>
                    <span className="ui-matchup-matrix__item-games">
                      {copy.games(formats.int(cell.games))}
                      {low && ` · ${copy.lowSample}`}
                    </span>
                  </span>
                  <span className="ui-matchup-matrix__bar" aria-hidden="true">
                    <span style={{ insetInlineStart: `${Math.min(50, 50 + offset)}%`, inlineSize: `${Math.abs(offset)}%` }} />
                  </span>
                  <span className="ui-matchup-matrix__item-rate">
                    {formats.pct(cell.winRate)}
                    <span className="ui-sr-only">{`, ${verdict(cell.winRate)}`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
