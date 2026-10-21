'use client';

import { useMemo, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cx } from '../primitives';
import { Skeleton } from '../basic/Skeleton';
import { AXIS_GAP, ChartAnnouncer, GlowFilter, ValueGrid, axisTickFormat, crisp, valueAxis } from './cartesian';
import { ChartDataTable } from './ChartDataTable';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip } from './ChartTooltip';
import { formatNumber, scaleLinear } from './scale';
import { bubbleRadius, linearRegression, type Regression } from './statistics';
import { useChartSize } from './useChartSize';
import { cssVars, seriesColor, toNumber, truncateText, useSvgId, useTextMeasure, valueFormat, type ValueFormatter } from './utils';
import { useLocale } from '../theme/ThemeProvider';
import { useThemeTokens } from '../theme/useThemeTokens';
import './Chart.css';
import './ScatterChart.css';

/** One group of points, drawn in its own color. */
export interface ScatterSeries<T> {
  label: string;
  data: T[];
  /** Any CSS color. Defaults to the next `--ui-chart-N` token. */
  color?: string;
}

export interface ScatterChartLabels {
  /** Shown instead of the plot when there is nothing to draw. Default "No data". */
  empty: string;
  /** Column header of the series in the accessible data table. Default "Series". */
  series: string;
  /** Column header of the point name in the accessible data table. Default "Name". */
  name: string;
  /** Prefix of the goodness of fit shown in the legend with `trendLine`. Default "R²". */
  rSquared: string;
}

const DEFAULT_LABELS: ScatterChartLabels = { empty: 'No data', series: 'Series', name: 'Name', rSquared: 'R²' };

export interface ScatterChartProps<T extends object> extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Groups of points, each in its own color with a legend item; all share the `x`/`y`/`size` fields. */
  series: ScatterSeries<T>[];
  /** Numeric field for the horizontal position. */
  x: keyof T & string;
  /** Numeric field for the vertical position. */
  y: keyof T & string;
  /** Numeric field encoded as bubble area (radius ∝ √value) — makes it a bubble chart. */
  size?: keyof T & string;
  /** Field that names a point in the tooltip and the data table. */
  name?: keyof T & string;
  /** Axis titles, drawn at the ends of the axes (also the data table headers, which default to the field keys). */
  xLabel?: string;
  /** Title above the y axis; also names y in the tooltip and data table (default there: the `y` key). */
  yLabel?: string;
  /** Names the size value in the tooltip and data table. Default: the `size` key. */
  sizeLabel?: string;
  /** Formats x values in the tooltip; axis ticks keep its units around a shorter number. Default: compact numbers on the axis. */
  xFormatter?: ValueFormatter;
  /** Formats y values in the tooltip; axis ticks keep its units around a shorter number. Default: compact numbers on the axis. */
  yFormatter?: ValueFormatter;
  /** Formats size values in the tooltip and the data table. */
  sizeFormatter?: ValueFormatter;
  /** Radius of the largest bubble in px (smaller on narrow charts). Default 24. */
  maxBubbleSize?: number;
  /** Radius of a point without `size`. Default 4. */
  pointSize?: number;
  /** Draws a least-squares trend line per series and shows its R² in the legend. */
  trendLine?: boolean;
  /** Plot height in px; width follows the container. Default 300. */
  height?: number;
  /** HearthPulse: dashed guides at fixed values (a 50% win rate); the axis range widens to include them. */
  referenceLines?: { axis: 'x' | 'y'; value: number; label?: string }[];
  /** HearthPulse: click, or Enter on the keyboard-picked point. On touch the first tap only shows the tooltip. */
  onPointClick?: (row: T, series: ScatterSeries<T>) => void;
  /** Grid lines at the x and y ticks; the zero lines are drawn either way. */
  showGrid?: boolean;
  /** Default: shown when there is more than one series or a trend line. Click an item to hide its series. */
  showLegend?: boolean;
  /** Shows a placeholder of the same height while data loads. */
  loading?: boolean;
  /** BCP 47 locale for the default number formatting. Default: the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  /** Overrides for the built-in strings. */
  labels?: Partial<ScatterChartLabels>;
  /** Accessible name of the chart (also the caption of its sr-only data table). */
  ariaLabel: string;
}

interface Dot {
  series: number;
  index: number;
  x: number;
  y: number;
  size: number | null;
  /** Pixel position inside the plot and radius. */
  px: number;
  py: number;
  r: number;
}

const MARGIN = { top: 12, right: 12, bottom: 28 };
const TITLE_H = 18;
/** Pointer distance (beyond a point's radius) that still picks it. */
const HIT_SLOP = 14;

/** Range padded so points on the extremes are not drawn on the axis lines. */
function paddedRange(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    return [lo - pad, hi + pad];
  }
  const pad = (hi - lo) * 0.06;
  // Keep a range that starts at zero anchored there: a negative tick for positive data reads wrong.
  lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad;
  hi = hi <= 0 && hi + pad > 0 ? 0 : hi + pad;
  return [lo, hi];
}

export function ScatterChart<T extends object>({
  series,
  x,
  y,
  size,
  name,
  xLabel,
  yLabel,
  sizeLabel,
  xFormatter,
  yFormatter,
  sizeFormatter,
  maxBubbleSize = 24,
  pointSize = 4,
  trendLine = false,
  height = 300,
  referenceLines,
  onPointClick,
  showGrid = true,
  showLegend,
  loading = false,
  locale: localeProp,
  labels,
  ariaLabel,
  className,
  style,
  ...rest
}: ScatterChartProps<T>) {
  const locale = useLocale(localeProp);
  const { ref: plotRef, width } = useChartSize();
  const measure = useTextMeasure(plotRef);
  // Gradient fills (`--ui-chart-fill: gradient`) paint points with their radial gradient; flat ones use the colour (CSS).
  const gradient = useThemeTokens(plotRef, { '--ui-chart-fill': 'flat' })['--ui-chart-fill'] === 'gradient';
  const svgId = useSvgId('ui-scatter');
  const text = { ...DEFAULT_LABELS, ...labels };
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  const [focusSeries, setFocusSeries] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ key: string; keyboard: boolean } | null>(null);
  const press = useRef<{ touch: boolean; picked: string | null }>({ touch: false, picked: null });

  const colors = series.map((s, i) => seriesColor(i, s.color));
  const formatX = valueFormat(xFormatter, locale);
  const formatY = valueFormat(yFormatter, locale);
  const formatSize = valueFormat(sizeFormatter, locale);
  const xTitle = xLabel ?? x;
  const yTitle = yLabel ?? y;
  const sizeTitle = sizeLabel ?? size ?? '';

  const model = useMemo(() => {
    // Valid points of every series (hidden ones too: the data table lists them all).
    const all = series.map((s, si) =>
      s.data.flatMap((row, index) => {
        const vx = toNumber(row[x]);
        const vy = toNumber(row[y]);
        if (vx == null || vy == null) return [];
        const vs = size ? toNumber(row[size]) : null;
        return [{ series: si, index, x: vx, y: vy, size: vs, px: 0, py: 0, r: 0 } as Dot];
      }),
    );
    const visible = all.filter((_, si) => !hidden.has(si)).flat();
    // Scale to the visible series; with all of them hidden, keep the full extent so the axes stay put.
    const extent = visible.length > 0 ? visible : all.flat();
    const hasData = extent.length > 0;

    const tickX = axisTickFormat(xFormatter, locale);
    const tickY = axisTickFormat(yFormatter, locale);
    const top = MARGIN.top + (yLabel ? TITLE_H : 0);
    const bottom = MARGIN.bottom + (xLabel ? TITLE_H : 0);
    const plotH = Math.max(0, height - top - bottom);
    const guides = hasData ? referenceLines ?? [] : [];
    const [ylo, yhi] = paddedRange([...extent.map((d) => d.y), ...guides.filter((g) => g.axis === 'y').map((g) => g.value)]);
    const [xlo, xhi] = paddedRange([...extent.map((d) => d.x), ...guides.filter((g) => g.axis === 'x').map((g) => g.value)]);
    // Tight domains: the data's own range plus a margin, not rounded out to the next round tick.
    const yAxis = valueAxis(ylo, yhi, plotH, tickY, measure, false, false, true);
    const left = Math.ceil(yAxis.labelWidth) + AXIS_GAP + 2;
    const plotW = Math.max(0, width - left - MARGIN.right);
    const xAxis = valueAxis(xlo, xhi, plotW, tickX, measure, true, false, true);
    const xs = scaleLinear(xAxis.domain, [0, plotW]);
    const ys = scaleLinear(yAxis.domain, [plotH, 0]);

    const maxSize = Math.max(0, ...extent.map((d) => d.size ?? 0));
    // Bubbles shrink with the plot (×0.55 on a phone), so they do not pile up on each other.
    const bubbleScale = Math.min(1, Math.max(0.55, plotW / 640));
    const maxR = Math.max(pointSize, Math.min(maxBubbleSize * bubbleScale, plotW / 14, plotH / 6));
    for (const d of all.flat()) {
      d.px = xs(d.x);
      d.py = ys(d.y);
      d.r = size ? bubbleRadius(d.size ?? 0, maxSize, maxR, Math.min(pointSize, 3)) : pointSize;
    }

    const fits: (Regression | null)[] = all.map((dots) => (trendLine ? linearRegression(dots) : null));
    const trends = fits.map((fit, si) => {
      if (!fit || all[si].length < 2) return null;
      const x0 = Math.min(...all[si].map((d) => d.x));
      const x1 = Math.max(...all[si].map((d) => d.x));
      return { x1: xs(x0), y1: ys(fit.predict(x0)), x2: xs(x1), y2: ys(fit.predict(x1)) };
    });

    // Keyboard order: left to right, then bottom to top.
    const order = [...visible].sort((a, b) => a.x - b.x || a.y - b.y || a.series - b.series);
    return { all, visible, order, hasData, top, plotH, plotW, left, xs, ys, xAxis, yAxis, fits, trends };
  }, [series, x, y, size, hidden, xFormatter, yFormatter, xLabel, yLabel, height, width, measure, locale, maxBubbleSize, pointSize, trendLine, referenceLines]);

  const { all, visible, order, hasData, top, plotH, plotW, left, xs, ys, xAxis, yAxis, fits, trends } = model;
  const keyOf = (d: Dot) => `${d.series}:${d.index}`;
  const active = cursor ? visible.find((d) => keyOf(d) === cursor.key) ?? null : null;

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mx = event.clientX - rect.left - left;
    const my = event.clientY - rect.top - top;
    let best: Dot | null = null;
    let bestDist = Infinity;
    for (const d of visible) {
      // Distance to the edge of the bubble, so small points next to big ones stay reachable.
      const dist = Math.max(0, Math.hypot(d.px - mx, d.py - my) - d.r);
      if (dist <= HIT_SLOP && dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    setCursor((prev) => (best ? (prev?.key === keyOf(best) && !prev.keyboard ? prev : { key: keyOf(best), keyboard: false }) : null));
  };

  const open = (d: Dot) => onPointClick?.(series[d.series].data[d.index], series[d.series]);
  const onPress = (event: PointerEvent<SVGSVGElement>) => {
    press.current = { touch: event.pointerType !== 'mouse', picked: cursor?.key ?? null };
    pick(event);
  };
  const onClick = () => {
    if (!active) return;
    // A first tap on touch reveals the tooltip; tapping the same point again opens it.
    if (press.current.touch && press.current.picked !== keyOf(active)) return;
    open(active);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (order.length === 0) return;
    if ((event.key === 'Enter' || event.key === ' ') && active && onPointClick) {
      event.preventDefault();
      open(active);
      return;
    }
    const at = active ? order.indexOf(active) : -1;
    let next: Dot | null | undefined;
    switch (event.key) {
      case 'ArrowRight':
        next = at < 0 ? order[0] : order[Math.min(order.length - 1, at + 1)];
        break;
      case 'ArrowLeft':
        next = at < 0 ? order[order.length - 1] : order[Math.max(0, at - 1)];
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!active) {
          next = order[0];
          break;
        }
        // Jump to the nearest point (by x) of the next / previous visible series.
        const ids = [...new Set(order.map((d) => d.series))].sort((a, b) => a - b);
        const step = event.key === 'ArrowUp' ? 1 : -1;
        const target = ids[(ids.indexOf(active.series) + step + ids.length) % ids.length];
        next = order
          .filter((d) => d.series === target)
          .reduce<Dot | null>((b, d) => (!b || Math.abs(d.x - active.x) < Math.abs(b.x - active.x) ? d : b), null);
        break;
      }
      case 'Home':
        next = order[0];
        break;
      case 'End':
        next = order[order.length - 1];
        break;
      case 'Escape':
        if (!active) return;
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    setCursor(next ? { key: keyOf(next), keyboard: true } : null);
  };

  const toggle = (si: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(si)) next.delete(si);
      else next.add(si);
      return next;
    });

  const pointName = (d: Dot) => (name ? String(series[d.series].data[d.index][name] ?? '') : '');
  const rowsFor = (d: Dot) => [
    { label: xTitle, value: formatX(d.x) },
    { label: yTitle, value: formatY(d.y) },
    ...(size ? [{ label: sizeTitle, value: d.size == null ? '–' : formatSize(d.size) }] : []),
  ];
  const describe = (d: Dot) => {
    const title = [pointName(d), series[d.series].label].filter(Boolean).join(', ');
    return `${title}: ${rowsFor(d).map((r) => `${r.label} ${r.value}`).join(', ')}`;
  };

  // Hovering the legend item of a hidden series highlights nothing.
  const highlight = focusSeries != null && !hidden.has(focusSeries) ? focusSeries : null;
  const legendOn = showLegend ?? (series.length > 1 || trendLine);
  const ready = width > 0 && !loading;
  const bubble = !!size;
  const r2Text = (fit: Regression | null) => (fit ? `${text.rSquared} ${formatNumber(fit.r2, { maximumFractionDigits: 2 }, locale)}` : undefined);

  return (
    <div
      {...rest}
      className={cx('ui-chart ui-scatter-chart', className)}
      style={{ ...cssVars({ '--_glow': `url(#${svgId}-glow)` }), ...style }}
      data-bubble={bubble || undefined}
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
            onPointerMove={pick}
            onPointerDown={onPress}
            onClick={onPointClick ? onClick : undefined}
            data-clickable={onPointClick && active ? '' : undefined}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setCursor(null)}
            tabIndex={order.length > 0 ? 0 : undefined}
            onKeyDown={onKeyDown}
            onBlur={() => setCursor(null)}
          >
            <defs>
              <GlowFilter id={`${svgId}-glow`} blur={3} dy={1.5} opacity={0.35} />
              {series.map((_, si) => (
                <radialGradient key={si} id={`${svgId}-fill-${si}`} cx="35%" cy="30%" r="75%" style={cssVars({ '--_color': colors[si] })}>
                  <stop offset="0%" className="ui-scatter-chart__stop" data-pos="start" />
                  <stop offset="100%" className="ui-scatter-chart__stop" data-pos="end" />
                </radialGradient>
              ))}
            </defs>
            {!hasData && (
              <text className="ui-chart__empty" x={width / 2} y={height / 2} textAnchor="middle" dy="0.32em">
                {text.empty}
              </text>
            )}
            {hasData && (
              <g transform={`translate(${left},${top})`}>
                <ValueGrid ticks={yAxis.ticks} labels={yAxis.labels} scale={ys} length={plotW} orientation="horizontal" showGrid={showGrid} />
                <ValueGrid
                  ticks={xAxis.ticks}
                  labels={xAxis.labels}
                  scale={xs}
                  length={plotH}
                  orientation="vertical"
                  showGrid={showGrid}
                  extent={plotW}
                  measure={measure}
                />
                {(referenceLines ?? []).map((guide) => {
                  const at = crisp(guide.axis === 'x' ? xs(guide.value) : ys(guide.value));
                  return (
                    <g key={`${guide.axis}:${guide.value}`} className="ui-scatter-chart__reference" aria-hidden="true">
                      {guide.axis === 'x' ? <line x1={at} x2={at} y1={0} y2={plotH} /> : <line x1={0} x2={plotW} y1={at} y2={at} />}
                      {guide.label && (
                        <text x={guide.axis === 'x' ? at + 6 : plotW - 4} y={guide.axis === 'x' ? 12 : at - 6} textAnchor={guide.axis === 'x' ? 'start' : 'end'}>
                          {guide.label}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* The domain need not include zero: frame the plot with its own baseline. */}
                <line className="ui-chart__grid ui-scatter-chart__baseline" x1={0} x2={plotW} y1={crisp(plotH)} y2={crisp(plotH)} />
                <g className="ui-scatter-chart__titles" aria-hidden="true">
                  {yLabel && (
                    <text className="ui-scatter-chart__axis-title" x={-left} y={-TITLE_H + 2}>
                      {truncateText(yTitle, Math.max(40, width / 2), measure)}
                    </text>
                  )}
                  {xLabel && (
                    <text className="ui-scatter-chart__axis-title" x={plotW} y={plotH + AXIS_GAP + 9 + TITLE_H} textAnchor="end">
                      {truncateText(xTitle, Math.max(40, width / 2), measure)}
                    </text>
                  )}
                </g>
                {active && (
                  <g aria-hidden="true">
                    <line className="ui-chart__crosshair" x1={crisp(active.px)} x2={crisp(active.px)} y1={0} y2={plotH} />
                    <line className="ui-chart__crosshair" x1={0} x2={plotW} y1={crisp(active.py)} y2={crisp(active.py)} />
                  </g>
                )}
                {series.map((_, si) =>
                  hidden.has(si) ? null : (
                    <g
                      key={si}
                      className="ui-scatter-chart__series"
                      style={cssVars({ '--_color': colors[si], ...(gradient ? { '--_fill': `url(#${svgId}-fill-${si})` } : {}) })}
                      data-dimmed={highlight != null && highlight !== si ? '' : undefined}
                    >
                      {trends[si] && (
                        <line className="ui-scatter-chart__trend" {...trends[si]} />
                      )}
                      {all[si].map((d, k) => (
                        <circle
                          key={d.index}
                          className="ui-scatter-chart__point"
                          cx={d.px}
                          cy={d.py}
                          r={d.r}
                          style={cssVars({ '--_i': Math.min(k, 40) })}
                          data-active={active === d || undefined}
                          data-faded={active != null && active !== d ? '' : undefined}
                        />
                      ))}
                    </g>
                  ),
                )}
                {active && (
                  <circle
                    className="ui-chart__dot ui-scatter-chart__focus"
                    cx={active.px}
                    cy={active.py}
                    r={active.r + 3}
                    style={cssVars({ '--_color': colors[active.series] })}
                    aria-hidden="true"
                  />
                )}
              </g>
            )}
          </svg>
        )}
        {ready && active && (
          <ChartTooltip
            className="ui-chart-tooltip--plain"
            x={left + active.px}
            y={top + active.py - active.r}
            bottom={top + active.py + active.r}
            anchorWidth={active.r * 2}
            containerWidth={width}
            containerHeight={height}
            title={
              <span className="ui-scatter-chart__tooltip-title">
                <span className="ui-chart-tooltip__swatch" style={cssVars({ '--_color': colors[active.series] })} />
                {pointName(active) || series[active.series].label}
                {pointName(active) && series.length > 1 && <span className="ui-scatter-chart__tooltip-series">{series[active.series].label}</span>}
              </span>
            }
            rows={rowsFor(active)}
          />
        )}
        <ChartAnnouncer text={cursor?.keyboard && active ? describe(active) : null} />
      </div>
      {legendOn && series.length > 0 && (
        <ChartLegend
          items={series.map((s, i) => ({ label: s.label, color: colors[i], hidden: hidden.has(i), value: trendLine ? r2Text(fits[i]) : undefined }))}
          activeIndex={highlight}
          onActiveIndexChange={setFocusSeries}
          onItemToggle={toggle}
        />
      )}
      <ChartDataTable
        caption={ariaLabel}
        columns={[text.series, ...(name ? [text.name] : []), xTitle, yTitle, ...(size ? [sizeTitle] : [])]}
        rows={all.flatMap((dots) =>
          dots.map((d) => [
            series[d.series].label,
            ...(name ? [pointName(d)] : []),
            formatX(d.x),
            formatY(d.y),
            ...(size ? [d.size == null ? '–' : formatSize(d.size)] : []),
          ]),
        )}
      />
    </div>
  );
}
