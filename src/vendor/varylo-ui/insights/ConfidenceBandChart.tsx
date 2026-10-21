'use client';

import { createElement, useId, useMemo, useState, type ComponentPropsWithRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { clamp, cx, getDirection } from '../primitives';
import { AlertCircleIcon } from '../icons';
import { Skeleton } from '../basic/Skeleton';
import { useLocale } from '../theme/ThemeProvider';
import { useLabels } from '../agents/labels';
import { bandGeometry, nearestIndex, type BandPoint } from './bands';
import { formatValue, type ValueFormat } from './scenario';
import './ConfidenceBandChart.css';

export interface ConfidenceBandChartLabels {
  title: string;
  actual: string;
  forecast: string;
  inner: (level: string) => string;
  outer: (level: string) => string;
  outlier: string;
  forecastStart: string;
  /** Text alternative of the chart. */
  summary: (first: string, last: string, low: string, high: string) => string;
  /** Hint on the focusable plot. */
  explore: string;
  readout: (label: string) => string;
  range: (low: string, high: string) => string;
  period: string;
  empty: string;
  loading: string;
}

const DEFAULT_LABELS: ConfidenceBandChartLabels = {
  title: 'Forecast',
  actual: 'Actual',
  forecast: 'Forecast',
  inner: (level) => `${level} interval`,
  outer: (level) => `${level} interval`,
  outlier: 'Outside the interval',
  forecastStart: 'Forecast',
  summary: (first, last, low, high) => `From ${first} to ${last}; the last forecast is likely between ${low} and ${high}.`,
  explore: 'Use the arrow keys to read each point.',
  readout: (label) => label,
  range: (low, high) => `${low} – ${high}`,
  period: 'Period',
  empty: 'No data yet.',
  loading: 'Loading the forecast',
};

export interface ConfidenceBandChartProps extends Omit<ComponentPropsWithRef<'figure'>, 'title' | 'children'> {
  /** Points in time order: actual values, forecasts and their intervals (any may be missing). */
  data: BandPoint[];
  /** Confidence of the inner and outer interval, for the legend. Default [0.5, 0.95]. */
  levels?: [inner: number, outer: number];
  /** How values read: plain, percent, currency or an Intl unit. */
  format?: ValueFormat;
  /** ISO 4217 code for `format: 'currency'`. */
  currency?: string;
  /** Plot height in px. Default 240. */
  height?: number;
  /** Mark actual values outside the outer interval. Default true. */
  showOutliers?: boolean;
  /** Point read out at first (keyboard and pointer move it). Default: the last actual. */
  defaultIndex?: number;
  /** Data is loading: skeleton. */
  loading?: boolean;
  /** Loading failed: shown instead of the chart. */
  error?: ReactNode;
  /** Heading. Default: `labels.title`. */
  title?: ReactNode;
  /** Level of the heading (default 3). */
  headingLevel?: 2 | 3 | 4 | 5;
  /** BCP 47 locale for numbers; defaults to the ThemeProvider's. */
  locale?: string;
  labels?: Partial<ConfidenceBandChartLabels>;
}

/**
 * A forecast with its uncertainty: actual values, the forecast line, an inner and an outer interval, and the
 * actuals that fell outside it. Every point can be read with the arrow keys or the pointer, the legend is a
 * real list and the data is also a table for screen readers.
 */
export function ConfidenceBandChart({
  data,
  levels = [0.5, 0.95],
  format = {},
  currency,
  height = 240,
  showOutliers = true,
  defaultIndex,
  loading = false,
  error,
  title,
  headingLevel = 3,
  locale: localeProp,
  labels,
  className,
  ref,
  ...rest
}: ConfidenceBandChartProps) {
  const locale = useLocale(localeProp);
  const copy = useLabels(DEFAULT_LABELS, labels);
  const uid = useId();
  const geometry = useMemo(() => bandGeometry(data), [data]);
  const lastActual = useMemo(() => data.reduce((last, p, i) => (p.actual !== undefined ? i : last), -1), [data]);
  const [focusRaw, setFocus] = useState<number | null>(defaultIndex ?? null);
  // The point to announce: set by keyboard moves only — following the mouse would make a screen reader
  // talk without pause.
  const [spoken, setSpoken] = useState<number | null>(null);
  const focus = data.length ? clamp(focusRaw ?? Math.max(0, lastActual), 0, data.length - 1) : -1;
  const fmt = (v: number | undefined) => (v === undefined ? '—' : formatValue(v, format, locale, currency));
  const tick = (v: number) => formatValue(v, { ...format, digits: undefined, compact: true }, locale, currency);
  const level = (n: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n);
  const outliers = useMemo(() => new Set(showOutliers ? geometry.outliers : []), [geometry, showOutliers]);
  const heading = createElement(`h${headingLevel}`, { className: 'ui-confidence-band__title', id: `${uid}-title` }, title ?? copy.title);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!data.length) return;
    const rtl = getDirection(event.currentTarget) === 'rtl';
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    let next = focus;
    if (step) next = focus + (rtl ? -step : step);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = data.length - 1;
    else return;
    event.preventDefault();
    const index = clamp(next, 0, data.length - 1);
    setFocus(index);
    setSpoken(index);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    let percent = ((event.clientX - rect.left) / rect.width) * 100;
    if (getDirection(event.currentTarget) === 'rtl') percent = 100 - percent;
    const index = nearestIndex(geometry.xs, percent);
    if (index !== focus) setFocus(index);
  };

  let body: ReactNode;
  if (error) {
    body = (
      <div className="ui-confidence-band__state" role="alert" data-state="error">
        <AlertCircleIcon aria-hidden="true" />
        <div>{error}</div>
      </div>
    );
  } else if (loading) {
    body = (
      <div className="ui-confidence-band__state" data-state="loading">
        <span className="ui-sr-only" role="status">
          {copy.loading}
        </span>
        <Skeleton height={height} aria-hidden="true" />
      </div>
    );
  } else if (data.length === 0) {
    body = <p className="ui-confidence-band__state">{copy.empty}</p>;
  } else {
    const point = data[focus];
    const last = data[data.length - 1];
    const span = geometry.domain[1] - geometry.domain[0] || 1;
    const pos = (v: number) => `${100 - ((v - geometry.domain[0]) / span) * 100}%`;
    body = (
      <>
        <div className="ui-confidence-band__readout" id={`${uid}-readout`}>
          <strong>{copy.readout(point.label)}</strong>
          {point.actual !== undefined && (
            <span data-key="actual">
              {copy.actual}: {fmt(point.actual)}
            </span>
          )}
          {point.forecast !== undefined && (
            <span data-key="forecast">
              {copy.forecast}: {fmt(point.forecast)}
            </span>
          )}
          {point.low !== undefined && point.high !== undefined && (
            <span data-key="outer">
              {copy.outer(level(levels[1]))}: {copy.range(fmt(point.low), fmt(point.high))}
            </span>
          )}
          {outliers.has(focus) && <span data-key="outlier">{copy.outlier}</span>}
        </div>
        <div className="ui-confidence-band__chart">
          <div className="ui-confidence-band__ticks" aria-hidden="true" style={{ blockSize: height }}>
            {geometry.ticks.map((t) => (
              <span key={t} style={{ insetBlockStart: pos(t) }}>
                {tick(t)}
              </span>
            ))}
          </div>
          <div
            className="ui-confidence-band__plot"
            style={{ blockSize: height }}
            role="group"
            tabIndex={0}
            aria-label={copy.summary(fmt(data[0].actual ?? data[0].forecast), fmt(last.forecast ?? last.actual), fmt(last.low), fmt(last.high))}
            aria-describedby={`${uid}-hint`}
            onKeyDown={onKeyDown}
            onPointerMove={onPointerMove}
          >
            <svg className="ui-confidence-band__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {geometry.ticks.map((t) => (
                <line key={t} className="ui-confidence-band__grid" x1="0" x2="100" y1={geometry.y(t)} y2={geometry.y(t)} />
              ))}
              {geometry.outer && <path className="ui-confidence-band__outer" d={geometry.outer} />}
              {geometry.inner && <path className="ui-confidence-band__inner" d={geometry.inner} />}
              {geometry.forecast && <path className="ui-confidence-band__forecast" d={geometry.forecast} />}
              {geometry.actual && <path className="ui-confidence-band__actual" d={geometry.actual} />}
            </svg>
            {geometry.forecastStart > 0 && (
              <span className="ui-confidence-band__split" style={{ insetInlineStart: `${geometry.xs[geometry.forecastStart - 1]}%` }} aria-hidden="true">
                <span>{copy.forecastStart}</span>
              </span>
            )}
            {[...outliers].map((i) => (
              <span
                key={i}
                className="ui-confidence-band__outlier"
                style={{ insetInlineStart: `${geometry.xs[i]}%`, insetBlockStart: pos(data[i].actual!) }}
                aria-hidden="true"
              />
            ))}
            <span className="ui-confidence-band__cursor" style={{ insetInlineStart: `${geometry.xs[focus]}%` }} aria-hidden="true" />
            {point.actual !== undefined && (
              <span className="ui-confidence-band__dot" data-key="actual" style={{ insetInlineStart: `${geometry.xs[focus]}%`, insetBlockStart: pos(point.actual) }} aria-hidden="true" />
            )}
            {point.forecast !== undefined && (
              <span className="ui-confidence-band__dot" data-key="forecast" style={{ insetInlineStart: `${geometry.xs[focus]}%`, insetBlockStart: pos(point.forecast) }} aria-hidden="true" />
            )}
          </div>
          <div className="ui-confidence-band__axis" aria-hidden="true">
            {data.map((p, i) =>
              i % Math.max(1, Math.ceil(data.length / 8)) === 0 || i === data.length - 1 ? (
                <span key={i} data-edge={i === 0 ? 'start' : i === data.length - 1 ? 'end' : undefined} style={{ insetInlineStart: `${geometry.xs[i]}%` }}>
                  {p.label}
                </span>
              ) : null,
            )}
          </div>
        </div>
        <p id={`${uid}-hint`} className="ui-sr-only">
          {copy.explore}
        </p>
        <span className="ui-sr-only" aria-live="polite">
          {spoken !== null && data[spoken]
            ? [
                copy.readout(data[spoken].label),
                data[spoken].actual !== undefined ? `${copy.actual}: ${fmt(data[spoken].actual)}` : '',
                data[spoken].forecast !== undefined ? `${copy.forecast}: ${fmt(data[spoken].forecast)}` : '',
                data[spoken].low !== undefined && data[spoken].high !== undefined
                  ? `${copy.outer(level(levels[1]))}: ${copy.range(fmt(data[spoken].low), fmt(data[spoken].high))}`
                  : '',
                outliers.has(spoken) ? copy.outlier : '',
              ]
                .filter(Boolean)
                .join('. ')
            : ''}
        </span>
        <ul className="ui-confidence-band__legend">
          {geometry.actual && <li data-key="actual">{copy.actual}</li>}
          {geometry.forecast && <li data-key="forecast">{copy.forecast}</li>}
          {geometry.inner && <li data-key="inner">{copy.inner(level(levels[0]))}</li>}
          {geometry.outer && <li data-key="outer">{copy.outer(level(levels[1]))}</li>}
          {outliers.size > 0 && <li data-key="outlier">{copy.outlier}</li>}
        </ul>
        {/* A table ignores the 1px box of ui-sr-only and widens the page on phones: the wrapper clips it. */}
        <div className="ui-sr-only">
        <table>
          <caption>{title ?? copy.title}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.period}</th>
              <th scope="col">{copy.actual}</th>
              <th scope="col">{copy.forecast}</th>
              <th scope="col">{copy.inner(level(levels[0]))}</th>
              <th scope="col">{copy.outer(level(levels[1]))}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr key={i}>
                <th scope="row">{p.label}</th>
                <td>
                  {fmt(p.actual)}
                  {outliers.has(i) ? ` (${copy.outlier})` : ''}
                </td>
                <td>{fmt(p.forecast)}</td>
                <td>{p.innerLow !== undefined && p.innerHigh !== undefined ? copy.range(fmt(p.innerLow), fmt(p.innerHigh)) : '—'}</td>
                <td>{p.low !== undefined && p.high !== undefined ? copy.range(fmt(p.low), fmt(p.high)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </>
    );
  }

  return (
    <figure ref={ref} className={cx('ui-confidence-band', className)} aria-labelledby={`${uid}-title`} aria-busy={loading || undefined} {...rest}>
      <figcaption className="ui-confidence-band__header">{heading}</figcaption>
      {body}
    </figure>
  );
}
