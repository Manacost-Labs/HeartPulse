'use client';

import { useRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon } from '../icons';
import { cx, mergeRefs } from '../primitives';
import { Badge, type BadgeColor } from '../basic/Badge';
import { formatPercent } from './scale';
import { valueFormat, type ValueFormatter } from './utils';
import { useLocale } from '../theme/ThemeProvider';
import { tokenNumber, useThemeTokens } from '../theme/useThemeTokens';
import './Chart.css';
import './MetricComparison.css';
import { withRef } from '../primitives/react-compat';

export interface ComparisonMetric {
  label: string;
  value: number;
  previous: number;
  /** Formatter for this metric (overrides `valueFormatter`), e.g. currency or ms. */
  format?: ValueFormatter;
  /** False for metrics where a decrease is good (latency, bounce rate). Default true. */
  higherIsBetter?: boolean;
  /**
   * HearthPulse: replaces the percentage-change badge when that change does not describe the row,
   * e.g. a sample size (more games is more reliable, not better) or a winner of two named sides.
   */
  badge?: { label: ReactNode; color?: BadgeColor; direction?: 'up' | 'down' | null; title?: string };
  /** HearthPulse: replaces the row's bars, e.g. two confidence intervals on a shared axis. */
  chart?: ReactNode;
}

export interface MetricComparisonLabels {
  /** Header of the metric name column. */
  metric: string;
  /** Header of the delta column. */
  change: string;
  /** Delta of a metric whose previous value was zero. */
  new: string;
  /** Screen-reader prefixes of the delta. */
  increase: string;
  decrease: string;
}

const DEFAULT_LABELS: MetricComparisonLabels = { metric: 'Metric', change: 'Change', new: 'New', increase: 'Up', decrease: 'Down' };

export interface MetricComparisonProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** One row per metric. */
  metrics: ComparisonMetric[];
  /**
   * `delta`: one bar per row from a centre line, its length the change on a scale shared by all
   * rows, green or red by whether the change is good. `paired`: current and previous bars, each
   * row scaled to its own larger value. Default `delta`.
   */
  bars?: 'delta' | 'paired';
  /** Column title for the current period. Default "Current". */
  currentLabel?: string;
  /** Column title for the previous period. Default "Previous". */
  previousLabel?: string;
  /** Formats current and previous values of metrics without their own `format`. */
  valueFormatter?: ValueFormatter;
  /** BCP 47 locale for the default number and percentage formatting. Default: the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  /** Overrides for the built-in strings. */
  labels?: Partial<MetricComparisonLabels>;
  /** Accessible name of the table. */
  ariaLabel?: string;
}

/** Current vs previous period for several metrics: values, delta with trend color and paired bars. */
export const MetricComparison = withRef(function MetricComparison({
  metrics,
  bars = 'delta',
  currentLabel = 'Current',
  previousLabel = 'Previous',
  valueFormatter,
  locale: localeProp,
  labels,
  ariaLabel,
  className,
  ref: forwardedRef,
  ...rest
}: MetricComparisonProps) {
  const locale = useLocale(localeProp);
  const ref = useRef<HTMLDivElement>(null);
  const tokens = useThemeTokens(ref, { '--ui-metric-comparison-bar-radius': '1.5px' });
  const text = { ...DEFAULT_LABELS, ...labels };
  const defaultFormat = valueFormat(valueFormatter, locale);
  const radius = tokenNumber(tokens['--ui-metric-comparison-bar-radius']);
  const delta = bars === 'delta';
  const changeOf = (m: ComparisonMetric) => {
    const value = Number.isFinite(m.value) ? m.value : 0;
    const previous = Number.isFinite(m.previous) ? m.previous : 0;
    return previous !== 0 ? (value - previous) / Math.abs(previous) : null;
  };
  // One scale for every row: the largest change reaches the end of its half.
  const maxChange = Math.max(0, ...metrics.map((m) => Math.abs(changeOf(m) ?? 0)));
  const signed = (ratio: number) => `${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${formatPercent(Math.abs(ratio), 0, locale)}`;

  return (
    <div
      {...rest}
      ref={mergeRefs(ref, forwardedRef)}
      className={cx('ui-metric-comparison', className)}
      role="table"
      aria-label={ariaLabel}
      data-bars={bars}
    >
      <div className="ui-metric-comparison__row ui-metric-comparison__head" role="row">
        <span className="ui-metric-comparison__cell" data-col="label" role="columnheader">
          {text.metric}
        </span>
        {delta ? (
          <span className="ui-metric-comparison__cell ui-metric-comparison__scale" data-col="bars" role="columnheader">
            {maxChange > 0 && (
              <>
                <span aria-hidden="true">{signed(-maxChange)}</span>
                <span className="ui-sr-only">{text.change}</span>
                <span aria-hidden="true">{signed(maxChange)}</span>
              </>
            )}
          </span>
        ) : (
          <span className="ui-metric-comparison__cell ui-metric-comparison__key" data-col="bars" role="columnheader">
            <span className="ui-metric-comparison__key-item" data-series="current">
              {currentLabel}
            </span>
            <span className="ui-metric-comparison__key-item" data-series="previous">
              {previousLabel}
            </span>
          </span>
        )}
        <span className="ui-metric-comparison__cell" data-col="value" role="columnheader">
          {currentLabel}
        </span>
        <span className="ui-metric-comparison__cell" data-col="previous" role="columnheader">
          {previousLabel}
        </span>
        <span className="ui-metric-comparison__cell" data-col="delta" role="columnheader">
          {text.change}
        </span>
      </div>
      {metrics.map((m, i) => {
        const format = m.format ?? defaultFormat;
        const value = Number.isFinite(m.value) ? m.value : 0;
        const previous = Number.isFinite(m.previous) ? m.previous : 0;
        const direction = value > previous ? 'up' : value < previous ? 'down' : 'flat';
        const good = direction === 'flat' ? null : (direction === 'up') === (m.higherIsBetter ?? true);
        const change = changeOf(m);
        const scale = Math.max(Math.abs(value), Math.abs(previous));
        const width = (v: number) => `${scale > 0 ? (Math.abs(v) / scale) * 100 : 0}%`;
        // Half of the track at most, from the centre line towards the side of the change.
        const half = change != null && maxChange > 0 ? (Math.abs(change) / maxChange) * 50 : 0;
        return (
          <div key={i} className="ui-metric-comparison__row" role="row">
            <span className="ui-metric-comparison__cell" data-col="label" role="rowheader">
              {m.label}
            </span>
            <span className="ui-metric-comparison__cell" data-col="bars" role="cell">
              {m.chart ?? (delta ? (
                <svg className="ui-metric-comparison__bars" width="100%" height={12} aria-hidden="true">
                  <line className="ui-metric-comparison__axis" x1="50%" x2="50%" y1={0} y2={12} />
                  {half > 0 && (
                    <rect
                      className="ui-metric-comparison__bar"
                      data-series="delta"
                      data-tone={good == null ? undefined : good ? 'good' : 'bad'}
                      data-dir={direction}
                      x={`${change! > 0 ? 50 : 50 - half}%`}
                      y={2}
                      width={`${half}%`}
                      height={8}
                      rx={radius}
                    />
                  )}
                </svg>
              ) : (
                <svg className="ui-metric-comparison__bars" width="100%" height={20} aria-hidden="true">
                  <rect className="ui-metric-comparison__bar" data-series="current" x={0} y={1} width={width(value)} height={8} rx={radius} />
                  <rect className="ui-metric-comparison__bar" data-series="previous" x={0} y={11} width={width(previous)} height={8} rx={radius} />
                </svg>
              ))}
            </span>
            {/* <bdi>: a formatted value ("2.11 s") keeps its own order under dir="rtl", aligned to the column end. */}
            <span className="ui-metric-comparison__cell" data-col="value" role="cell">
              <bdi>{format(value)}</bdi>
            </span>
            <span className="ui-metric-comparison__cell" data-col="previous" role="cell">
              <bdi>{format(previous)}</bdi>
            </span>
            <span className="ui-metric-comparison__cell" data-col="delta" role="cell">
              {m.badge ? (
                <Badge
                  size="sm"
                  color={m.badge.color ?? 'gray'}
                  title={m.badge.title}
                  icon={m.badge.direction === 'up' ? <ArrowUpIcon size={12} /> : m.badge.direction === 'down' ? <ArrowDownIcon size={12} /> : undefined}
                >
                  {m.badge.label}
                </Badge>
              ) : (
              <Badge
                size="sm"
                color={good == null ? 'gray' : good ? 'green' : 'red'}
                icon={direction === 'up' ? <ArrowUpIcon size={12} /> : direction === 'down' ? <ArrowDownIcon size={12} /> : undefined}
              >
                {direction !== 'flat' && <span className="ui-sr-only">{direction === 'up' ? text.increase : text.decrease} </span>}
                {change == null ? (value === 0 ? formatPercent(0, 1, locale) : text.new) : formatPercent(Math.abs(change), 1, locale)}
              </Badge>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
});
