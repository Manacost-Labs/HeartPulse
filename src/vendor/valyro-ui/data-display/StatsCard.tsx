'use client';

import { useMemo, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '../primitives';
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from '../icons';
import { useLocale } from '../theme/ThemeProvider';
import { Skeleton } from '../basic/Skeleton';
import { areaPath, linePath, type Point } from '../charts/scale';
import './StatsCard.css';
import { withRef, useId } from '../primitives/react-compat';

export type StatsTone = 'positive' | 'negative' | 'neutral';

export interface StatsCardLabels {
  /** Screen-reader prefix for a rising / falling / flat delta. */
  increase: string;
  decrease: string;
  unchanged: string;
}

export interface StatsCardProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Metric name in the card header, e.g. "Revenue". */
  label: ReactNode;
  /** A number (formatted with `locale` and `format`) or pre-formatted content such as "$12,480". */
  value: ReactNode;
  /** Number formatting for a numeric `value`, e.g. `{ notation: 'compact' }` or a currency. */
  format?: Intl.NumberFormatOptions;
  /** Change in percent (12.5 → "12.5%"). The sign sets the arrow and color. */
  delta?: number;
  /** Treat a decrease as good news (error rate, latency, churn). */
  invertTrend?: boolean;
  /** Decorative icon at the end of the header, opposite the label (hidden from screen readers). */
  icon?: ReactNode;
  /** Context next to the delta, e.g. "vs last week". */
  caption?: ReactNode;
  /** Series for a small trend line. Needs at least two finite points. */
  sparkline?: number[];
  /** Skeleton lines replace the value, delta and sparkline; the label stays. Sets `aria-busy`. */
  loading?: boolean;
  /** Number and percent formatting. Defaults to the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  labels?: Partial<StatsCardLabels>;
}

const DEFAULT_LABELS: StatsCardLabels = { increase: 'Up', decrease: 'Down', unchanged: 'No change' };

export function getTrendTone(delta: number, invertTrend = false): StatsTone {
  if (delta === 0 || !Number.isFinite(delta)) return 'neutral';
  return delta > 0 !== invertTrend ? 'positive' : 'negative';
}

export const StatsCard = withRef(function StatsCard({
  label,
  value,
  format,
  delta,
  invertTrend = false,
  icon,
  caption,
  sparkline,
  loading = false,
  locale: localeProp,
  labels: labelsProp,
  className,
  ...rest
}: StatsCardProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const locale = useLocale(localeProp);
  const formats = useMemo(
    () => ({
      value: new Intl.NumberFormat(locale, format),
      percent: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }),
    }),
    [locale, format],
  );
  const hasDelta = delta !== undefined && Number.isFinite(delta);
  const tone = hasDelta ? getTrendTone(delta, invertTrend) : 'neutral';
  const direction = !hasDelta || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const TrendIcon = direction === 'up' ? TrendingUpIcon : direction === 'down' ? TrendingDownIcon : MinusIcon;
  const shownValue = typeof value === 'number' ? formats.value.format(value) : value;

  return (
    <div className={cx('ui-stats-card ui-panel', className)} data-tone={tone} aria-busy={loading || undefined} {...rest}>
      <div className="ui-stats-card__header">
        <span className="ui-stats-card__label">{label}</span>
        {icon && (
          <span className="ui-stats-card__icon" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <div className="ui-stats-card__body">
        {loading ? (
          // Same footprint as the loaded card (value line, meta line, sparkline), so nothing jumps when data lands.
          <>
            <div className="ui-stats-card__main">
              <Skeleton width="55%" height={28} />
              <Skeleton width="40%" height={12} style={{ marginBlock: 4 }} />
            </div>
            {sparkline && (
              <span className="ui-stats-card__sparkline" aria-hidden="true">
                <Skeleton height="100%" />
              </span>
            )}
          </>
        ) : (
          <>
            <div className="ui-stats-card__main">
              <span className="ui-stats-card__value">{shownValue}</span>
              {(hasDelta || caption) && (
                <div className="ui-stats-card__meta">
                  {hasDelta && (
                    <span className="ui-stats-card__delta" data-tone={tone}>
                      <TrendIcon size={14} strokeWidth={2} />
                      <span className="ui-sr-only">
                        {direction === 'up' ? labels.increase : direction === 'down' ? labels.decrease : labels.unchanged}{' '}
                      </span>
                      {formats.percent.format(Math.abs(delta) / 100)}
                    </span>
                  )}
                  {caption && <span className="ui-stats-card__caption">{caption}</span>}
                </div>
              )}
            </div>
            {sparkline && <Sparkline values={sparkline} />}
          </>
        )}
      </div>
    </div>
  );
});

const VIEW_W = 120;
const VIEW_H = 40;
const INSET = 3;

/** Decorative trend line; the numbers it summarises are already in the card's text. */
function Sparkline({ values }: { values: number[] }) {
  const gradientId = useId();
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  // The inset keeps the stroke and end dot from clipping at the extremes.
  const points = finite.map((v, i): Point => [
    (i / (finite.length - 1)) * VIEW_W,
    range === 0 ? VIEW_H / 2 : INSET + (1 - (v - min) / range) * (VIEW_H - INSET * 2),
  ]);
  // The same smooth (monotone, never overshooting) curve as the KpiGroup sparkline.
  const line = linePath(points, 'monotone');
  const area = areaPath(points, [[0, VIEW_H], [VIEW_W, VIEW_H]], 'monotone');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <span className="ui-stats-card__sparkline" aria-hidden="true">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* An HTML dot stays round although the SVG is stretched with preserveAspectRatio="none". */}
      <span
        className="ui-stats-card__sparkline-dot"
        style={{ left: `${(lastX / VIEW_W) * 100}%`, top: `${(lastY / VIEW_H) * 100}%` }}
      />
    </span>
  );
}
