'use client';

import { useMemo, useState, type ComponentPropsWithRef, type PointerEvent } from 'react';
import { cx } from '../primitives';
import { Skeleton } from '../basic/Skeleton';
import { ChartAnnouncer, GlowFilter, describeRow, useActiveIndex } from './cartesian';
import { ChartDataTable } from './ChartDataTable';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip } from './ChartTooltip';
import { formatCompact, niceTicks, polar, type Point } from './scale';
import { useChartSize } from './useChartSize';
import {
  cssVars,
  seriesColor,
  toNumber,
  useSvgId,
  wrapText,
  useTextMeasure,
  valueFormat,
  type ChartSeries,
  type ValueFormatter,
} from './utils';
import { useLocale } from '../theme/ThemeProvider';
import { useThemeTokens } from '../theme/useThemeTokens';
import './Chart.css';
import './RadarChart.css';

export interface RadarChartLabels {
  /** Shown when there are fewer than three axes (or no values). Default "No data". */
  empty: string;
}

const DEFAULT_LABELS: RadarChartLabels = { empty: 'No data' };

export interface RadarChartProps<T extends object, A extends keyof T & string = keyof T & string>
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** One row per axis (3–12 read well). */
  data: T[];
  /** Field naming each axis. */
  axis: A;
  /** One filled polygon per series. */
  series: ChartSeries<T>[];
  /** Value at the outer ring. Default: a nice number above the largest value. */
  max?: number;
  /** Number of grid rings. Default 4. */
  levels?: number;
  /** Default: the theme's `--ui-radar-chart-grid` (`polygon` in Vercel, `circle` in Glass). */
  gridShape?: 'polygon' | 'circle';
  /** Chart height in px; the radar is centred in the container width. Default 320. */
  height?: number;
  /** Formats values in the tooltip and table; ring labels use compact numbers by default. */
  valueFormatter?: ValueFormatter;
  /** BCP 47 locale for the default number formatting. Default: the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  /** Header of the axis column in the accessible data table. Default: the `axis` key. */
  axisLabel?: string;
  /** Overrides for the built-in strings. */
  labels?: Partial<RadarChartLabels>;
  /** Default: shown when there is more than one series. Click an item to hide its series. */
  showLegend?: boolean;
  /** Shows a placeholder of the same height while data loads. */
  loading?: boolean;
  /** Accessible name of the chart (also the caption of its sr-only data table). */
  ariaLabel: string;
}

const LABEL_GAP = 12;
const TICK_FONT = { size: 10 };
/** Below this width the axis labels are set a size smaller, the radar takes more of the width and the ring values are left out. */
const COMPACT_WIDTH = 480;
/** Line height of a wrapped axis label. */
const LINE_H = 14;
/** Room above and below the outer ring for a one-line axis label (gap, nudge, text, spare). */
const V_ROOM = LABEL_GAP + 6 + 13 + 4;

const pointsAttr = (points: readonly Point[]) => points.map(([px, py]) => `${Math.round(px * 100) / 100},${Math.round(py * 100) / 100}`).join(' ');

export function RadarChart<T extends object, A extends keyof T & string>({
  data,
  axis,
  series,
  max,
  levels = 4,
  gridShape,
  height = 320,
  valueFormatter,
  locale: localeProp,
  axisLabel,
  labels,
  showLegend,
  loading = false,
  ariaLabel,
  className,
  style,
  ...rest
}: RadarChartProps<T, A>) {
  const locale = useLocale(localeProp);
  const { ref: plotRef, width } = useChartSize();
  const measure = useTextMeasure(plotRef);
  const tokens = useThemeTokens(plotRef, { '--ui-radar-chart-grid': 'polygon', '--ui-chart-fill': 'flat' });
  const svgId = useSvgId('ui-radar');
  const text = { ...DEFAULT_LABELS, ...labels };
  const n = data.length;
  const { active, keyboard, setActive, keyboardProps } = useActiveIndex(n >= 3 ? n : 0);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  const [focusSeries, setFocusSeries] = useState<number | null>(null);
  const shape = gridShape ?? (tokens['--ui-radar-chart-grid'] === 'circle' ? 'circle' : 'polygon');
  // Gradient fills (`--ui-chart-fill: gradient`) paint each area with its radial gradient; flat ones use a tint (CSS).
  const colors = series.map((s, i) => seriesColor(i, s.color));
  const formatValue = valueFormat(valueFormatter, locale);
  const formatMaybe = (v: number | null) => (v == null ? '–' : formatValue(v));
  const compact = width > 0 && width < COMPACT_WIDTH;
  const LABEL_FONT = compact ? { size: 11 } : { size: 12 };

  const model = useMemo(() => {
    const values = series.map((s) => data.map((row) => toNumber(row[s.key])));
    const names = data.map((row) => String(row[axis] ?? ''));
    const visible = values.filter((_, si) => !hidden.has(si));
    const top = Math.max(0, ...(visible.length ? visible : values).flat().map((v) => v ?? 0));
    const ticks = niceTicks(0, max ?? top, Math.max(1, levels));
    const outer = max ?? ticks.domain[1];
    const rings = max != null ? Array.from({ length: Math.max(1, levels) }, (_, k) => (max * (k + 1)) / Math.max(1, levels)) : ticks.ticks.filter((t) => t > 0);

    // Room for the axis labels: the widest one may sit at 3 or 9 o'clock. Labels wrap to two
    // lines (at spaces) before they are truncated, so the radar keeps a usable size in a narrow container.
    const sideMax = Math.max(48, width * (compact ? 0.24 : 0.26));
    const lineWidth = (l: string) => Math.max(...wrapText(l, sideMax, measure, LABEL_FONT).map((line) => measure(line, LABEL_FONT)));
    const widest = Math.min(Math.max(0, ...names.map(lineWidth)), sideMax);
    const ox = width / 2;
    const oy = height / 2;
    const angle = (i: number) => (i / Math.max(1, n)) * Math.PI * 2;

    const layoutAxes = (radius: number) =>
      names.map((name, i) => {
        const a = angle(i);
        const [lx, ly] = polar(ox, oy, radius + LABEL_GAP, a);
        const sin = Math.sin(a);
        const cos = Math.cos(a);
        const anchor: 'start' | 'middle' | 'end' = Math.abs(sin) < 0.2 ? 'middle' : sin > 0 ? 'start' : 'end';
        // Labels on the sides may use the margin; those at top and bottom the space between their
        // neighbours, which start a step round the ring and run outwards.
        const between = 2 * (radius + LABEL_GAP) * Math.abs(Math.sin((2 * Math.PI) / Math.max(3, n))) - 12;
        const room = anchor === 'middle' ? Math.min(width - 8, Math.max(48, between)) : anchor === 'start' ? width - lx - 4 : lx - 4;
        const lines = wrapText(name, room, measure, LABEL_FONT);
        // First baseline: above the ring the block grows upwards, below it downwards, beside it from its middle.
        const first = cos > 0.2 ? -(lines.length - 1) * LINE_H : cos < -0.2 ? 8.5 : 3.8 - ((lines.length - 1) * LINE_H) / 2;
        return {
          name,
          lines,
          end: polar(ox, oy, radius, a),
          lx,
          // Nudge labels above / below the ring so they never touch it.
          ly: ly + (Math.abs(cos) > 0.2 ? (cos > 0 ? -4 : 6) : 0),
          first,
          anchor,
          // Top and bottom labels on two lines need a line more of vertical room.
          tall: Math.abs(cos) > 0.9 && lines.length > 1,
        };
      });
    // Narrow charts favour the plot (at least a quarter of the width on a phone); the labels wrap around it.
    let radius = Math.max(24, Math.min(height / 2 - V_ROOM, Math.max(width / 2 - widest - LABEL_GAP - 4, width * (compact ? 0.25 : 0.22))));
    let axes = layoutAxes(radius);
    if (axes.some((a) => a.tall) && radius - LINE_H >= 24) {
      radius -= LINE_H;
      axes = layoutAxes(radius);
    }
    const rOf = (v: number) => (outer > 0 ? (Math.max(0, Math.min(v, outer)) / outer) * radius : 0);
    const ring = (r: number) =>
      shape === 'circle' ? null : pointsAttr(Array.from({ length: n }, (_, i) => polar(ox, oy, r, angle(i))));
    const polygons = values.map((vals) => vals.map((v, i) => polar(ox, oy, rOf(v ?? 0), angle(i))));
    const hasData = n >= 3 && values.some((vals) => vals.some((v) => v != null));
    return { values, names, rings, outer, radius, ox, oy, axes, ring, polygons, rOf, angle, hasData };
  }, [data, axis, series, hidden, max, levels, width, height, measure, shape, n, compact]);

  const { values, names, rings, radius, ox, oy, axes, ring, polygons, rOf, angle, hasData } = model;
  const tickFormat = valueFormatter ?? ((v: number) => formatCompact(v, locale));

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - rect.left - ox;
    const dy = event.clientY - rect.top - oy;
    if (Math.hypot(dx, dy) > radius + LABEL_GAP * 3) {
      setActive(null);
      return;
    }
    // 0 at 12 o'clock, clockwise — the same convention as `polar`.
    const a = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
    setActive(Math.round((a / (Math.PI * 2)) * n) % n);
  };

  const toggle = (si: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(si)) next.delete(si);
      else next.add(si);
      return next;
    });

  const shown = series.map((_, si) => si).filter((si) => !hidden.has(si));
  const rowsAt = (i: number) => shown.map((si) => ({ label: series[si].label, color: colors[si], value: formatMaybe(values[si][i]) }));
  // Hovering the legend item of a hidden series highlights nothing.
  const highlight = focusSeries != null && !hidden.has(focusSeries) ? focusSeries : null;
  const legendOn = showLegend ?? series.length > 1;
  const ready = width > 0 && !loading;
  // Tooltip beside the outermost vertex of the active axis.
  const anchor = active != null ? polar(ox, oy, Math.max(...shown.map((si) => rOf(values[si][active] ?? 0)), 0), angle(active)) : null;

  return (
    <div
      {...rest}
      className={cx('ui-chart ui-radar-chart', className)}
      style={{ ...cssVars({ '--_glow': `url(#${svgId}-glow)` }), ...style }}
      aria-busy={loading || undefined}
    >
      <div ref={plotRef} className="ui-chart__plot" style={{ height }}>
        {loading && <Skeleton className="ui-chart__skeleton" height={height} />}
        {ready && (
          <svg
            className="ui-chart__svg"
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setActive(null)}
            data-compact={compact || undefined}
            {...keyboardProps}
          >
            <defs>
              <GlowFilter id={`${svgId}-glow`} blur={4} dy={2} opacity={0.35} />
              {series.map((s, si) => (
                <radialGradient key={s.key} id={`${svgId}-fill-${si}`} cx={ox} cy={oy} r={radius} gradientUnits="userSpaceOnUse" style={cssVars({ '--_color': colors[si] })}>
                  <stop offset="0%" className="ui-radar-chart__stop" data-pos="start" />
                  <stop offset="100%" className="ui-radar-chart__stop" data-pos="end" />
                </radialGradient>
              ))}
            </defs>
            {!hasData && (
              <text className="ui-chart__empty" x={width / 2} y={height / 2} textAnchor="middle" dy="0.32em">
                {text.empty}
              </text>
            )}
            {hasData && (
              <>
                <g className="ui-radar-chart__grid" aria-hidden="true">
                  {rings.map((t) => {
                    const r = rOf(t);
                    const points = ring(r);
                    return points ? (
                      <polygon key={t} className="ui-radar-chart__ring" points={points} />
                    ) : (
                      <circle key={t} className="ui-radar-chart__ring" cx={ox} cy={oy} r={r} />
                    );
                  })}
                  {axes.map((a, i) => (
                    <line
                      key={i}
                      className="ui-radar-chart__spoke"
                      x1={ox}
                      y1={oy}
                      x2={a.end[0]}
                      y2={a.end[1]}
                      data-active={active === i || undefined}
                    />
                  ))}
                </g>
                {series.map((s, si) =>
                  hidden.has(si) ? null : (
                    <g
                      key={s.key}
                      className="ui-radar-chart__series"
                      style={{ ...cssVars({ '--_color': colors[si], ...(tokens['--ui-chart-fill'] === 'gradient' ? { '--_fill': `url(#${svgId}-fill-${si})` } : {}), '--_i': si }), transformOrigin: `${ox}px ${oy}px` }}
                      data-dimmed={highlight != null && highlight !== si ? '' : undefined}
                    >
                      <polygon className="ui-radar-chart__area" points={pointsAttr(polygons[si])} />
                      {polygons[si].map(([px, py], i) =>
                        values[si][i] == null ? null : (
                          <circle key={i} className="ui-radar-chart__vertex" cx={px} cy={py} r={active === i ? 4.5 : 2.5} data-active={active === i || undefined} />
                        ),
                      )}
                    </g>
                  ),
                )}
                {/* The scale: the outer ring's value beside the first spoke, on a plate in the card colour
                    (inner rings would sit on the series' lines). Narrow charts leave it to the tooltip. */}
                <g className="ui-radar-chart__ticks" aria-hidden="true">
                  {(compact ? [] : rings.slice(-1)).map((t) => {
                    const label = tickFormat(t);
                    const w = measure(label, TICK_FONT) + 8;
                    return (
                      <g key={t}>
                        <rect className="ui-radar-chart__tick-bg" x={ox + 6} y={oy - rOf(t) - 7} width={w} height={14} rx={3} />
                        <text className="ui-radar-chart__tick" x={ox + 10} y={oy - rOf(t)} dy="0.34em">
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </g>
                <g aria-hidden="true">
                  {axes.map((a, i) => (
                    <text
                      key={i}
                      className="ui-radar-chart__label"
                      x={a.lx}
                      y={a.ly}
                      textAnchor={a.anchor}
                      data-active={active === i || undefined}
                    >
                      {a.lines.join(' ') !== a.name && <title>{a.name}</title>}
                      {a.lines.map((line, k) => (
                        <tspan key={k} x={a.lx} dy={k === 0 ? a.first : LINE_H}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  ))}
                </g>
              </>
            )}
          </svg>
        )}
        {ready && active != null && anchor && (
          <ChartTooltip
            x={anchor[0]}
            y={anchor[1]}
            anchorWidth={12}
            containerWidth={width}
            containerHeight={height}
            title={names[active]}
            rows={rowsAt(active)}
          />
        )}
        <ChartAnnouncer text={keyboard && active != null ? describeRow(names[active], rowsAt(active)) : null} />
      </div>
      {legendOn && (
        <ChartLegend
          className="ui-radar-chart__legend"
          items={series.map((s, i) => ({ label: s.label, color: colors[i], hidden: hidden.has(i) }))}
          activeIndex={highlight}
          onActiveIndexChange={setFocusSeries}
          onItemToggle={toggle}
        />
      )}
      <ChartDataTable
        caption={ariaLabel}
        columns={[axisLabel ?? axis, ...series.map((s) => s.label)]}
        rows={names.map((nm, i) => [nm, ...values.map((vals) => formatMaybe(vals[i]))])}
      />
    </div>
  );
}
