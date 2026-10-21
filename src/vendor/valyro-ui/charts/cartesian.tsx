'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { BarChartIcon } from '../icons';
import { clamp } from '../primitives';
import { Skeleton } from '../basic/Skeleton';
import { formatCompact, formatNumber, niceTicks, placeLabels, type LinearScale, type NiceTicks } from './scale';
import type { MeasureText, ValueFormatter } from './utils';

/** Space between an axis label and the plot edge. */
export const AXIS_GAP = 8;
/** Minimum space between two neighbouring axis labels. */
const LABEL_GAP = 12;

/**
 * Formats one axis tick. `step` (the tick spacing) and `extent` (the largest absolute tick) let a
 * format choose one precision and notation for the whole axis; a plain ValueFormatter fits too.
 */
export type TickFormat = (value: number, step: number, extent: number) => string;

/** Decimals needed to tell ticks `step` apart: 0.0005 → 4, 2.5 → 1, 50 → 0. */
function decimalsOf(step: number) {
  if (!(step > 0) || !Number.isFinite(step)) return 0;
  const [mantissa, exponent] = String(Number(step.toPrecision(12))).split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent ?? 0));
}

/**
 * The units `format` puts around a number ("$" before, " ms" after), read off `format(1)` and
 * `format(1000)`. Null when the number does not come out as written (a formatter that rescales,
 * like a percentage of a ratio, or switches units, like ms → s): its own output is the tick then.
 */
function affixesOf(format: ValueFormatter): { prefix: string; suffix: string } | null {
  const split = (n: number, number: RegExp) => {
    const s = format(n);
    const first = s.search(/\d/);
    if (first < 0) return null;
    let last = first;
    for (let i = first; i < s.length; i++) if (/\d/.test(s[i])) last = i;
    return number.test(s.slice(first, last + 1)) ? { prefix: s.slice(0, first), suffix: s.slice(last + 1) } : null;
  };
  try {
    const one = split(1, /^1(?:[.,]0+)?$/);
    const thousand = split(1000, /^1[\s.,'’]?000(?:[.,]0+)?$/);
    return one && thousand && one.prefix === thousand.prefix && one.suffix === thousand.suffix ? one : null;
  } catch {
    return null;
  }
}

/**
 * Axis ticks need less than a tooltip: they keep the units of `valueFormatter` around a short
 * number — compact on axes that reach 10 000 ("15K $", "15 тыс. $"), otherwise only the
 * decimals the tick step needs ("$210", not "$210.00"). With `narrow` (a phone-sized plot),
 * compact ticks leave the units out ("15 тыс."): the chart's title carries them. `tickFormatter`
 * replaces all of it.
 */
export function axisTickFormat(valueFormatter: ValueFormatter | undefined, locale?: string, tickFormatter?: ValueFormatter, narrow = false): TickFormat {
  // Called with the value only: a formatter may take other optional arguments (a locale).
  if (tickFormatter) return (v) => tickFormatter(v);
  if (!valueFormatter) return (v) => formatCompact(v, locale);
  const affixes = affixesOf(valueFormatter);
  if (!affixes) return (v) => valueFormatter(v);
  return (v, step, extent) => {
    const abs = Math.abs(v);
    const digits = decimalsOf(step);
    const compact = extent >= 10_000;
    const number = compact
      ? formatNumber(abs, { notation: 'compact', maximumFractionDigits: 2 }, locale)
      : formatNumber(abs, { minimumFractionDigits: digits, maximumFractionDigits: digits }, locale);
    if (compact && narrow) return `${v < 0 ? '-' : ''}${number}`;
    return `${v < 0 ? '-' : ''}${affixes.prefix}${number}${affixes.suffix}`;
  };
}

/**
 * Nice ticks for a value axis plus the width their labels need. Includes zero unless
 * `includeZero` is false (prices, scatter axes). Labels laid out along the axis (an x axis)
 * also thin the ticks until none overlap. With `tight`, the domain stays [lo, hi] instead of
 * growing to the outer ticks, and only the ticks inside it are kept (scatter axes, whose data
 * would otherwise sit in a third of the plot).
 */
export function valueAxis(
  lo: number,
  hi: number,
  length: number,
  format: TickFormat,
  measure: MeasureText,
  alongAxis = false,
  includeZero = true,
  tight = false,
) {
  let count = clamp(Math.round(length / (alongAxis ? 72 : 56)), 2, 6);
  for (;;) {
    let nice: NiceTicks = includeZero ? niceTicks(Math.min(0, lo), Math.max(0, hi), count) : niceTicks(lo, hi, count);
    if (tight && hi > lo) {
      // One more interval than asked: the outer ticks usually fall outside the tight domain.
      const inner = niceTicks(lo, hi, count + 1);
      const ticks = inner.ticks.filter((t) => t >= lo - 1e-9 * Math.abs(hi - lo) && t <= hi + 1e-9 * Math.abs(hi - lo));
      if (ticks.length >= 2) nice = { domain: [lo, hi], ticks, step: inner.step };
    }
    const extent = nice.ticks.reduce((m, t) => Math.max(m, Math.abs(t)), 0);
    const labels = nice.ticks.map((t) => format(t, nice.step, extent));
    const labelWidth = labels.reduce((max, label) => Math.max(max, measure(label)), 0);
    const spacing = nice.ticks.length > 1 ? (length * nice.step) / Math.max(1e-9, nice.domain[1] - nice.domain[0]) : length;
    if (!alongAxis || count <= 1 || spacing >= labelWidth + LABEL_GAP) return { ...nice, labels, labelWidth };
    count--;
  }
}

/** Empty state over a plot: an icon and the chart's `empty` label, centred in the plot box. */
export function ChartEmpty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="ui-chart__empty-state">
      <span className="ui-chart__empty-icon" aria-hidden="true">
        {icon ?? <BarChartIcon size={18} />}
      </span>
      <span className="ui-chart__empty-text">{children}</span>
    </div>
  );
}

/** Loading placeholder of a treemap: a few tiles of falling size filling the plot. */
export function TilesSkeleton() {
  return (
    <div className="ui-chart__tiles-skeleton" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height="100%" />
      ))}
    </div>
  );
}

/** Bar heights of the loading placeholder, as fractions of the plot. */
const SKELETON_BARS = [0.46, 0.72, 0.58, 0.9, 0.64, 0.8, 0.52];

/** Loading placeholder of a bar chart: a few bars on a baseline and grid, in the plot's box. */
export function BarsSkeleton({ horizontal = false }: { horizontal?: boolean }) {
  return (
    <div className="ui-chart__bars-skeleton" data-orientation={horizontal ? 'horizontal' : 'vertical'} aria-hidden="true">
      {(horizontal ? SKELETON_BARS.slice(0, 5).sort((a, b) => b - a) : SKELETON_BARS).map((v, i) => (
        <Skeleton
          key={i}
          className="ui-chart__bars-skeleton-bar"
          style={horizontal ? { width: `${v * 100}%`, height: 12 } : { width: 'auto', height: `${v * 100}%` }}
        />
      ))}
    </div>
  );
}

// Grid lines sit on half pixels so a 1px stroke stays crisp.
export const crisp = (v: number) => Math.round(v - 0.5) + 0.5;

interface ValueGridProps {
  ticks: number[];
  labels: string[];
  scale: LinearScale;
  /** Plot width (horizontal grid) or height (vertical grid). */
  length: number;
  orientation: 'horizontal' | 'vertical';
  showGrid: boolean;
  /** Plot width for vertical grids: the outermost labels are anchored inward to stay inside it. */
  extent?: number;
  measure?: MeasureText;
}

/** Grid lines + value labels; horizontal = y axis on the left, vertical = x axis below. */
export function ValueGrid({ ticks, labels, scale, length, orientation, showGrid, extent, measure }: ValueGridProps) {
  return (
    <g className="ui-chart__value-axis" aria-hidden="true">
      {ticks.map((tick, i) => {
        const pos = crisp(scale(tick));
        if (orientation === 'horizontal') {
          return (
            <g key={tick}>
              {(showGrid || tick === 0) && (
                <line className="ui-chart__grid" data-zero={tick === 0 || undefined} x1={0} x2={length} y1={pos} y2={pos} />
              )}
              <text className="ui-chart__axis-label" x={-AXIS_GAP} y={pos} dy="0.32em" textAnchor="end">
                {labels[i]}
              </text>
            </g>
          );
        }
        const half = measure ? measure(labels[i]) / 2 : 0;
        const anchor = extent != null && pos - half < 0 ? 'start' : extent != null && pos + half > extent ? 'end' : 'middle';
        return (
          <g key={tick}>
            {(showGrid || tick === 0) && (
              <line className="ui-chart__grid" data-zero={tick === 0 || undefined} x1={pos} x2={pos} y1={0} y2={length} />
            )}
            <text
              className="ui-chart__axis-label"
              x={anchor === 'start' ? 0 : anchor === 'end' ? extent : pos}
              y={length + AXIS_GAP + 9}
              textAnchor={anchor}
            >
              {labels[i]}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export interface CategoryItem {
  index: number;
  position: number;
  /** Label as drawn (possibly truncated). */
  label: string;
  /** Full text, shown as a native tooltip when `label` was truncated. */
  title?: string;
}

interface CategoryLabelsProps {
  items: CategoryItem[];
  /** Plot width — labels near the edges are shifted inward so they never overflow. */
  width: number;
  y: number;
  measure: MeasureText;
}

/** X-axis labels thinned to the densest evenly spaced set that does not overlap. */
export function CategoryLabels({ items, width, y, measure }: CategoryLabelsProps) {
  const placed = placeLabels(
    items.map((item) => ({ position: item.position, width: measure(item.label) })),
    width,
    LABEL_GAP,
  );
  return (
    <g className="ui-chart__category-axis" aria-hidden="true">
      {placed.map(({ index, x, anchor }) => {
        const item = items[index];
        return (
          <text key={item.index} className="ui-chart__axis-label" x={x} y={y} textAnchor={anchor}>
            {item.title && item.title !== item.label && <title>{item.title}</title>}
            {item.label}
          </text>
        );
      })}
    </g>
  );
}

/** Hovered / keyboard-selected data index for charts that show one tooltip per index. */
export function useActiveIndex(count: number) {
  const [state, setState] = useState<{ index: number; keyboard: boolean } | null>(null);

  // Pointer updates: keep the same object while the index is unchanged, so moves don't re-render.
  const setActive = (index: number | null) =>
    setState((prev) => (index == null ? null : prev?.index === index && !prev.keyboard ? prev : { index, keyboard: false }));

  const onKeyDown = (event: KeyboardEvent) => {
    if (count === 0) return;
    const current = state && state.index < count ? state.index : null;
    let next: number | null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = current == null ? 0 : Math.min(count - 1, current + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = current == null ? count - 1 : Math.max(0, current - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      case 'Escape':
        if (current == null) return;
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    setState(next == null ? null : { index: next, keyboard: true });
  };

  // The data may shrink while an index is active.
  const active = state != null && state.index < count ? state.index : null;
  return {
    active,
    /** True when the active index was chosen with the keyboard (it is then announced). */
    keyboard: active != null && state!.keyboard,
    setActive,
    keyboardProps: {
      tabIndex: count > 0 ? 0 : undefined,
      onKeyDown,
      // Also how a touch tooltip goes away: charts ignore touch pointerleave, which fires right after the tap that
      // picked a point, so the value stays until a tap elsewhere blurs the chart.
      onBlur: () => setState(null),
    },
  };
}

/**
 * Polite live region for keyboard exploration: tooltips are aria-hidden, so the focused
 * point is read from here instead.
 */
export function ChartAnnouncer({ text }: { text: string | null }) {
  return (
    <div className="ui-sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}

/**
 * Soft glow in the shape's own color (a blurred, faded copy beneath it) for the Glass theme.
 * An SVG filter rather than CSS `drop-shadow()`, which Safari ignores on SVG elements;
 * user-space units so flat lines (a zero-height bounding box) still render.
 */
export function GlowFilter({ id, blur = 3, dy = 2, opacity = 0.4 }: { id: string; blur?: number; dy?: number; opacity?: number }) {
  return (
    <filter id={id} filterUnits="userSpaceOnUse" x="-25%" y="-50%" width="150%" height="200%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} />
      <feOffset dy={dy} />
      <feComponentTransfer result="glow">
        <feFuncA type="linear" slope={opacity} />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** Values for the tooltip rows / announcement of one index: "Label: value". */
export function describeRow(title: string, rows: { label: string; value: string }[]) {
  return `${title}: ${rows.map((r) => `${r.label} ${r.value}`).join(', ')}`;
}
