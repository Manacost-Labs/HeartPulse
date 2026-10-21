'use client';

import { useLayoutEffect, useMemo, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent } from 'react';
import { addDays, clamp, cx, formatDate, getWeekdayNames, startOfDay, startOfWeek, type WeekStart } from '../primitives';
import { ChartAnnouncer } from './cartesian';
import { ChartDataTable } from './ChartDataTable';
import { ChartTooltip } from './ChartTooltip';
import { placeLabels } from './scale';
import { useChartSize } from './useChartSize';
import { cssVars, toDate, toNumber, truncateText, useTextMeasure, valueFormat, type ValueFormatter } from './utils';
import { useLocale } from '../theme/ThemeProvider';
import { tokenNumber, useThemeTokens } from '../theme/useThemeTokens';
import './Chart.css';
import './Heatmap.css';

/** Color for an intensity in [0, 1]: the empty tint at 0, then the chart color mixed over transparency. */
function cellFill(t: number) {
  return t <= 0 ? 'var(--ui-surface-3)' : `color-mix(in srgb, var(--_color) ${Math.round(Math.min(1, t) * 100)}%, transparent)`;
}

/** The same fill made opaque over the card (see `[data-ink]` in Chart.css): what a cell value's ink is picked against. */
function inkBackground(t: number) {
  return `color-mix(in srgb, var(--_color) ${Math.round(Math.min(1, Math.max(0, t)) * 100)}%, light-dark(#fff, #000))`;
}

/**
 * Column labels on a narrow grid: when they share a first word ("Week 0", "Week 1"…) and do not
 * all fit, that word shrinks to its initial ("W0", "W1"…) so every column keeps a label.
 */
function abbreviate(columns: readonly string[]): string[] | null {
  if (columns.length < 2) return null;
  const head = /^(\S+)\s+(\S.*)$/.exec(columns[0])?.[1];
  if (!head) return null;
  const rests = columns.map((c) => (c.startsWith(`${head} `) ? c.slice(head.length + 1).trim() : null));
  if (rests.some((r) => !r)) return null;
  const initial = Array.from(head)[0];
  return rests.map((r) => `${initial}${r}`);
}

function HeatmapLegend({ steps, less, more, maxWidth }: { steps: number; less: string; more: string; maxWidth?: number }) {
  return (
    <div className="ui-heatmap-legend" aria-hidden="true" style={{ maxWidth }}>
      <span>{less}</span>
      {Array.from({ length: steps }, (_, k) => (
        <span key={k} className="ui-heatmap-legend__swatch" style={{ background: cellFill(k / (steps - 1)) }} />
      ))}
      <span>{more}</span>
    </div>
  );
}

const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/**
 * Hovered or keyboard-selected cell. `move` maps an arrow/Home/End key to the next index;
 * the first key press selects `initial`.
 */
function useCellCursor(count: number, initial: number, move: (index: number, key: string) => number) {
  const [cursor, setCursor] = useState<{ index: number; keyboard: boolean } | null>(null);
  const active = cursor != null && cursor.index < count ? cursor : null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (count === 0) return;
    if (event.key === 'Escape') {
      if (!active) return;
      event.preventDefault();
      setCursor(null);
      return;
    }
    if (!NAV_KEYS.has(event.key)) return;
    event.preventDefault();
    setCursor({ index: clamp(active ? move(active.index, event.key) : initial, 0, count - 1), keyboard: true });
  };

  return {
    active: active?.index ?? null,
    keyboard: active?.keyboard ?? false,
    hover: (index: number | null) => setCursor(index == null ? null : { index, keyboard: false }),
    keyboardProps: { tabIndex: count > 0 ? 0 : undefined, onKeyDown, onBlur: () => setCursor(null) },
  };
}

/* ───────────────────────── Calendar (contributions) ───────────────────────── */

export interface CalendarHeatmapDatum {
  /** A Date or an ISO day ("2026-03-04", read as a local calendar day). */
  date: Date | string;
  value: number;
}

export interface CalendarHeatmapLabels {
  /** Ends of the color legend. */
  less: string;
  more: string;
  /** Column headers of the accessible table of monthly totals. */
  month: string;
  total: string;
}

const CALENDAR_LABELS: CalendarHeatmapLabels = { less: 'Less', more: 'More', month: 'Month', total: 'Total' };

export interface CalendarHeatmapProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  data: CalendarHeatmapDatum[];
  /** Last day shown. Default: the latest date in `data`, or today. */
  endDate?: Date;
  /** Number of week columns. Default 53 (a year). */
  weeks?: number;
  /** 0 = Sunday (GitHub style), 1 = Monday. */
  weekStartsOn?: WeekStart;
  /** Any CSS color. Default `--ui-chart-1`. */
  color?: string;
  /** Color steps including the empty one. Default 5. */
  levels?: number;
  valueFormatter?: ValueFormatter;
  /** BCP 47 locale for month, weekday and number formatting. Default: the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  /** Overrides for the built-in strings. */
  labels?: Partial<CalendarHeatmapLabels>;
  ariaLabel: string;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const MONTH_H = 18;

/** GitHub-style contributions grid: weeks × weekdays with month labels. */
export function CalendarHeatmap({
  data,
  endDate,
  weeks = 53,
  weekStartsOn = 0,
  color = 'var(--ui-chart-1)',
  levels = 5,
  valueFormatter,
  locale: localeProp,
  labels,
  ariaLabel,
  className,
  style,
  ...rest
}: CalendarHeatmapProps) {
  const locale = useLocale(localeProp);
  const { ref: plotRef, width } = useChartSize();
  const measure = useTextMeasure(plotRef);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tokens = useThemeTokens(plotRef, { '--ui-calendar-heatmap-cell-radius': '2px', '--ui-heatmap-cell-radius-ratio': '0.25' });
  const [scrollLeft, setScrollLeft] = useState(0);
  const formatValue = valueFormat(valueFormatter, locale);
  const steps = Math.max(2, Math.round(levels));
  const text = { ...CALENDAR_LABELS, ...labels };

  const { days, max, monthTotals } = useMemo(() => {
    const byDay = new Map<string, number>();
    let latest: Date | null = null;
    for (const d of data) {
      const date = toDate(d.date);
      const value = toNumber(d.value);
      if (!date || value == null) continue;
      byDay.set(dayKey(date), (byDay.get(dayKey(date)) ?? 0) + value);
      if (!latest || date.getTime() > latest.getTime()) latest = date;
    }
    const end = startOfDay(endDate ?? latest ?? new Date());
    const first = startOfWeek(addDays(end, -(Math.max(1, weeks) * 7 - 1)), weekStartsOn);
    const days: { date: Date; value: number }[] = [];
    for (let date = first; date.getTime() <= end.getTime(); date = addDays(date, 1)) days.push({ date, value: byDay.get(dayKey(date)) ?? 0 });
    const monthTotals: { date: Date; total: number }[] = [];
    for (const d of days) {
      const last = monthTotals[monthTotals.length - 1];
      if (last && last.date.getMonth() === d.date.getMonth() && last.date.getFullYear() === d.date.getFullYear()) last.total += d.value;
      else monthTotals.push({ date: d.date, total: d.value });
    }
    return { days, max: days.reduce((m, d) => Math.max(m, d.value), 0), monthTotals };
  }, [data, endDate, weeks, weekStartsOn]);

  const level = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.min(steps - 1, Math.ceil((v / max) * (steps - 1))));
  const cols = Math.ceil(days.length / 7);

  const weekdays = getWeekdayNames(locale, weekStartsOn, 'short');
  const weekdayW = Math.ceil(Math.max(...[1, 3, 5].map((row) => measure(weekdays[row])))) + 8;
  // Fill the width, but keep cells legible; narrow containers scroll horizontally instead.
  const pitch = Math.max(11, Math.min(22, Math.floor((width - weekdayW) / Math.max(1, cols))));
  const gap = pitch >= 15 ? 3 : 2;
  const cell = pitch - gap;
  // The weekday labels stay pinned on the left; only the weeks scroll.
  const gridW = cols * pitch - gap;
  const svgW = weekdayW + gridW;
  const svgH = MONTH_H + 7 * pitch - gap;
  const [edges, setEdges] = useState({ start: false, end: false });

  // A month label is shown only where it fits before the next one; the current month may
  // shift left to end with the grid, as long as it clears the previous label.
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  const starts: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (c === 0 || days[c * 7].date.getMonth() !== days[(c - 1) * 7].date.getMonth()) starts.push(c);
  }
  const months: { c: number; x: number; label: string }[] = [];
  starts.forEach((c, i) => {
    const label = monthFmt.format(days[c * 7].date);
    const w = measure(label);
    const x = c * pitch;
    const next = starts[i + 1];
    if (next != null) {
      if (w + 4 <= (next - c) * pitch) months.push({ c, x, label });
      return;
    }
    const shifted = Math.min(x, gridW - w);
    const prev = months[months.length - 1];
    if (!prev || shifted >= prev.x + measure(prev.label) + 6) months.push({ c, x: shifted, label });
  });

  const cursor = useCellCursor(days.length, days.length - 1, (i, key) => {
    switch (key) {
      case 'ArrowUp':
        return i - 1;
      case 'ArrowDown':
        return i + 1;
      case 'ArrowLeft':
        return i - 7;
      case 'ArrowRight':
        return i + 7;
      case 'Home':
        return 0;
      default:
        return days.length - 1;
    }
  });

  // Which ends of the scroller hide weeks: those edges fade out instead of cutting a column in half.
  const syncEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 };
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  };

  // Start at the most recent weeks when the grid is wider than the container.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    syncEdges();
  }, [svgW, width]);

  // The tooltip sits outside the scroller, so it needs the scroll offset — tracked only while it shows.
  const syncScroll = () => setScrollLeft(scrollRef.current?.scrollLeft ?? 0);

  // Keep the keyboard-selected week in view.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || cursor.active == null || !cursor.keyboard) return;
    const x = Math.floor(cursor.active / 7) * pitch;
    if (x < el.scrollLeft) el.scrollLeft = x;
    else if (x + pitch > el.scrollLeft + el.clientWidth) el.scrollLeft = x + pitch - el.clientWidth;
    setScrollLeft(el.scrollLeft);
    syncEdges();
  }, [cursor.active, cursor.keyboard, pitch]);

  const cellX = (i: number) => Math.floor(i / 7) * pitch;
  const cellY = (i: number) => MONTH_H + (i % 7) * pitch;
  const hovered = cursor.active != null ? days[cursor.active] : null;
  const title = (d: Date) => formatDate(d, locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div {...rest} className={cx('ui-chart ui-calendar-heatmap', className)} style={{ ...cssVars({ '--_color': color }), ...style }}>
      <div ref={plotRef} className="ui-chart__plot ui-calendar-heatmap__body">
        {width > 0 && (
          <svg className="ui-calendar-heatmap__weekdays" width={weekdayW} height={svgH} aria-hidden="true">
            {[1, 3, 5].map((row) => (
              <text key={row} className="ui-chart__axis-label" x={0} y={MONTH_H + row * pitch + cell / 2} dy="0.32em">
                {weekdays[row]}
              </text>
            ))}
          </svg>
        )}
        <div
          ref={scrollRef}
          className="ui-calendar-heatmap__scroll"
          data-fade-start={edges.start || undefined}
          data-fade-end={edges.end || undefined}
          onScroll={() => {
            syncEdges();
            if (cursor.active != null) syncScroll();
          }}
        >
          {width > 0 && (
            <svg
              className="ui-chart__svg ui-calendar-heatmap__svg"
              width={gridW}
              height={svgH}
              role="img"
              aria-label={ariaLabel}
              onPointerLeave={(event) => event.pointerType === 'mouse' && cursor.hover(null)}
              {...cursor.keyboardProps}
            >
              <g aria-hidden="true">
                {months.map(({ c, x, label }) => (
                  <text key={c} className="ui-chart__axis-label" x={x} y={11}>
                    {label}
                  </text>
                ))}
              </g>
              {days.map((d, i) => (
                <rect
                  key={i}
                  className="ui-calendar-heatmap__cell"
                  x={cellX(i)}
                  y={cellY(i)}
                  width={cell}
                  height={cell}
                  rx={Math.min(tokenNumber(tokens['--ui-calendar-heatmap-cell-radius']), cell * tokenNumber(tokens['--ui-heatmap-cell-radius-ratio']))}
                  style={{ ...cssVars({ '--_c': Math.floor(i / 7) }), fill: cellFill(level(d.value) / (steps - 1)) }}
                  data-active={cursor.active === i || undefined}
                  onPointerEnter={() => {
                    syncScroll();
                    cursor.hover(i);
                  }}
                />
              ))}
            </svg>
          )}
        </div>
        {hovered && cursor.active != null && (
          <ChartTooltip
            placement="top"
            x={weekdayW + cellX(cursor.active) + cell / 2 - scrollLeft}
            y={cellY(cursor.active)}
            bottom={cellY(cursor.active) + cell}
            containerWidth={width}
            title={title(hovered.date)}
          >
            <div className="ui-heatmap-tooltip__value">{formatValue(hovered.value)}</div>
          </ChartTooltip>
        )}
        <ChartAnnouncer text={cursor.keyboard && hovered ? `${title(hovered.date)}: ${formatValue(hovered.value)}` : null} />
      </div>
      <HeatmapLegend steps={steps} less={text.less} more={text.more} maxWidth={svgW} />
      <ChartDataTable
        caption={ariaLabel}
        columns={[text.month, text.total]}
        rows={monthTotals.map((m) => [formatDate(m.date, locale, { month: 'long', year: 'numeric' }), formatValue(m.total)])}
      />
    </div>
  );
}

/* ───────────────────────── Matrix ───────────────────────── */

export interface HeatmapLabels {
  /** Ends of the color legend. */
  less: string;
  more: string;
}

const MATRIX_LABELS: HeatmapLabels = { less: 'Less', more: 'More' };

export interface HeatmapProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Row labels, top to bottom; long ones are truncated to fit the label column. */
  rows: string[];
  /** Column labels, left to right; labels that would overlap are skipped. */
  columns: string[];
  /** `values[row][column]`. Missing or non-finite values render as empty cells. */
  values: number[][];
  /** Any CSS color. Default `--ui-chart-1`. */
  color?: string;
  /** Formats values in the tooltip, cells and data table. */
  valueFormatter?: ValueFormatter;
  /** BCP 47 locale for the default number formatting. Default: the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  /** Overrides for the built-in strings. */
  labels?: Partial<HeatmapLabels>;
  /** Print the value inside each cell (where it fits). */
  showValues?: boolean;
  /** Default 28. */
  cellHeight?: number;
  /** Accessible name of the chart (also the caption of its sr-only data table). */
  ariaLabel: string;
}

const COLUMN_H = 20;
const ROW_FONT = { size: 12 };
const CELL_GAP = 2;

/** Rows × columns matrix with a continuous color scale. */
export function Heatmap({
  rows,
  columns,
  values,
  color = 'var(--ui-chart-1)',
  valueFormatter,
  locale: localeProp,
  labels,
  showValues = false,
  cellHeight = 28,
  ariaLabel,
  className,
  style,
  ...rest
}: HeatmapProps) {
  const locale = useLocale(localeProp);
  const { ref: plotRef, width } = useChartSize();
  const measure = useTextMeasure(plotRef);
  const tokens = useThemeTokens(plotRef, { '--ui-chart-capsule': '0', '--ui-heatmap-cell-radius': '3px', '--ui-heatmap-cell-radius-ratio': '0.25' });
  // Capsule themes round cells relative to their short side, the others relative to their width.
  const cellRadius = (w: number, h: number) =>
    Math.min(tokenNumber(tokens['--ui-heatmap-cell-radius']), (tokenNumber(tokens['--ui-chart-capsule']) > 0 ? Math.min(w, h) : w) * tokenNumber(tokens['--ui-heatmap-cell-radius-ratio']));
  const formatValue = valueFormat(valueFormatter, locale);
  const text = { ...MATRIX_LABELS, ...labels };
  const C = columns.length;

  const cells = useMemo(() => rows.map((_, r) => columns.map((_, c) => toNumber(values[r]?.[c]))), [rows, columns, values]);
  const flat = cells.flat().filter((v): v is number => v != null);
  const lo = Math.min(0, ...flat);
  const hi = Math.max(0, ...flat);
  const intensity = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0);

  const labelW = Math.ceil(Math.min(rows.reduce((m, l) => Math.max(m, measure(l, ROW_FONT)), 0) + 10, width * 0.3));
  const cellW = C ? Math.max(0, (width - labelW) / C) : 0;
  const svgH = COLUMN_H + rows.length * cellHeight;
  const placeColumns = (labels: string[]) =>
    placeLabels(
      labels.map((col, c) => ({ position: c * cellW + cellW / 2, width: measure(col) })),
      width - labelW,
      6,
    );
  let columnLabels = columns.map((col) => truncateText(col, Math.max(cellW * 3, 40), measure));
  let columnTicks = placeColumns(columnLabels);
  const short = columnTicks.length < C ? abbreviate(columns) : null;
  if (short) {
    const shortTicks = placeColumns(short);
    if (shortTicks.length > columnTicks.length) {
      columnLabels = short;
      columnTicks = shortTicks;
    }
  }

  const cursor = useCellCursor(rows.length * C, 0, (i, key) => {
    const r = Math.floor(i / C);
    const c = i % C;
    switch (key) {
      case 'ArrowLeft':
        return c > 0 ? i - 1 : i;
      case 'ArrowRight':
        return c < C - 1 ? i + 1 : i;
      case 'ArrowUp':
        return r > 0 ? i - C : i;
      case 'ArrowDown':
        return r < rows.length - 1 ? i + C : i;
      case 'Home':
        return r * C;
      default:
        return r * C + C - 1;
    }
  });

  const hovered = cursor.active != null ? { r: Math.floor(cursor.active / C), c: cursor.active % C } : null;
  const hoveredValue = hovered ? cells[hovered.r][hovered.c] : null;
  const cellBox = (r: number, c: number) => ({
    x: labelW + c * cellW + CELL_GAP / 2,
    y: COLUMN_H + r * cellHeight + CELL_GAP / 2,
    w: Math.max(0, cellW - CELL_GAP),
    h: Math.max(0, cellHeight - CELL_GAP),
  });
  const format = (v: number | null) => (v == null ? '–' : formatValue(v));

  return (
    <div {...rest} className={cx('ui-chart ui-heatmap', className)} style={{ ...cssVars({ '--_color': color }), ...style }}>
      <div ref={plotRef} className="ui-chart__plot" style={{ height: svgH }}>
        {width > 0 && (
          <svg
            className="ui-chart__svg"
            width={width}
            height={svgH}
            role="img"
            aria-label={ariaLabel}
            onPointerLeave={(event) => event.pointerType === 'mouse' && cursor.hover(null)}
            {...cursor.keyboardProps}
          >
            <g aria-hidden="true">
              {columnTicks.map(({ index, x, anchor }) => (
                <text key={index} className="ui-chart__axis-label" x={labelW + x} y={12} textAnchor={anchor}>
                  {columnLabels[index] !== columns[index] && <title>{columns[index]}</title>}
                  {columnLabels[index]}
                </text>
              ))}
              {rows.map((label, r) => {
                const shown = truncateText(label, labelW - 10, measure, ROW_FONT);
                return (
                  <text
                    key={r}
                    className="ui-chart__axis-label ui-heatmap__row-label"
                    x={labelW - 10}
                    y={COLUMN_H + r * cellHeight + cellHeight / 2}
                    dy="0.32em"
                    textAnchor="end"
                  >
                    {shown !== label && <title>{label}</title>}
                    {shown}
                  </text>
                );
              })}
            </g>
            {cells.map((row, r) =>
              row.map((v, c) => {
                const { x, y, w, h } = cellBox(r, c);
                const t = v == null ? 0 : intensity(v);
                const index = r * C + c;
                // A percentage too wide for its cell drops its sign ("100 %" → "100") before it is left out.
                const formatted = showValues && v != null ? formatValue(v) : null;
                const label = formatted != null && measure(formatted) + 6 > w ? formatted.replace(/\s*%$/, '') : formatted;
                return (
                  <g key={index}>
                    <rect
                      className="ui-heatmap__cell"
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      rx={cellRadius(w, h)}
                      style={{ ...cssVars({ '--_c': c }), fill: v == null ? 'var(--ui-surface-2)' : cellFill(t) }}
                      data-active={cursor.active === index || undefined}
                      onPointerEnter={() => cursor.hover(index)}
                    />
                    {label != null && measure(label) + 6 <= w && (
                      <text
                        className="ui-heatmap__value"
                        data-ink=""
                        style={cssVars({ '--_ink-bg': inkBackground(t) })}
                        x={x + w / 2}
                        y={y + h / 2}
                        dy="0.32em"
                        textAnchor="middle"
                      >
                        {label}
                      </text>
                    )}
                  </g>
                );
              }),
            )}
          </svg>
        )}
        {hovered && cursor.active != null && (
          <ChartTooltip
            placement="top"
            x={labelW + hovered.c * cellW + cellW / 2}
            y={cellBox(hovered.r, hovered.c).y}
            bottom={cellBox(hovered.r, hovered.c).y + cellBox(hovered.r, hovered.c).h}
            containerWidth={width}
            title={`${rows[hovered.r]} · ${columns[hovered.c]}`}
          >
            <div className="ui-heatmap-tooltip__value">{format(hoveredValue)}</div>
          </ChartTooltip>
        )}
        <ChartAnnouncer
          text={cursor.keyboard && hovered ? `${rows[hovered.r]}, ${columns[hovered.c]}: ${format(hoveredValue)}` : null}
        />
      </div>
      <HeatmapLegend steps={5} less={text.less} more={text.more} />
      <ChartDataTable
        caption={ariaLabel}
        columns={['', ...columns]}
        rows={rows.map((label, r) => [label, ...cells[r].map(format)])}
      />
    </div>
  );
}
