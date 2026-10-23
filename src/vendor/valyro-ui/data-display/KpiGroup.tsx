'use client';

import { useMemo, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from 'react';
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from '../icons';
import { cx } from '../primitives';
import { useLocale } from '../theme/ThemeProvider';
import { Skeleton } from '../basic/Skeleton';
import { Sparkline } from '../charts/Sparkline';
import { getTrendTone, type StatsTone } from './StatsCard';
import './KpiGroup.css';
import { withRef } from '../primitives/react-compat';

export interface KpiItem {
  id: string;
  label: ReactNode;
  /** Current value; `null` shows a dash (no data yet). */
  value: number | null;
  /** Number formatting, e.g. `{ style: 'currency', currency: 'USD', notation: 'compact' }`. */
  format?: Intl.NumberFormatOptions;
  /** Value of the comparison period; the change in percent is computed from it. */
  previous?: number | null;
  /** Change in percent, when it comes precomputed; wins over `previous`. */
  delta?: number;
  /** Treat a decrease as good news (churn, latency, refunds). */
  invertTrend?: boolean;
  /** Series for the sparkline, oldest first. */
  trend?: (number | null)[];
  /** Goal for the period: adds a progress bar and "72% of $500K". */
  target?: number;
  icon?: ReactNode;
  /** Replaces the group's `comparisonLabel` for this tile. */
  caption?: ReactNode;
}

export interface KpiGroupLabels {
  increase: string;
  decrease: string;
  unchanged: string;
  /** Screen-reader text for a missing value. */
  noData: string;
  /** "72% of $500K" under the target bar. */
  ofTarget: (percent: string, target: string) => string;
  /** Accessible name of the group while it loads. */
  loading: string;
}

export const defaultKpiGroupLabels: KpiGroupLabels = {
  increase: 'Up',
  decrease: 'Down',
  unchanged: 'No change',
  noData: 'No data',
  ofTarget: (percent, target) => `${percent} of ${target}`,
  loading: 'Loading metrics',
};

export interface KpiGroupProps extends Omit<ComponentPropsWithRef<'ul'>, 'children'> {
  /** Metrics, one tile each in order: value, change vs the previous period, optional sparkline and target. */
  items: KpiItem[];
  /** Context after every delta, e.g. "vs last month". */
  comparisonLabel?: ReactNode;
  /** `joined` — one panel split by hairlines (default); `cards` — a panel per metric. */
  variant?: 'joined' | 'cards';
  /** Narrowest tile before the grid wraps, px. Default 200. */
  minTileWidth?: number;
  /** Skeleton tiles; with no `items` yet, `skeletonCount` of them. */
  loading?: boolean;
  /** Placeholder tiles shown while `loading` and `items` is still empty. */
  skeletonCount?: number;
  locale?: string;
  labels?: Partial<KpiGroupLabels>;
}

/** Change from `previous` to `value` in percent, or undefined when it can't be computed. */
export function computeKpiDelta(value: number | null | undefined, previous: number | null | undefined): number | undefined {
  if (value == null || previous == null || !Number.isFinite(value) || !Number.isFinite(previous) || previous === 0) return undefined;
  return ((value - previous) / Math.abs(previous)) * 100;
}

/** Share of the target reached, as a fraction (may exceed 1), or undefined. */
export function computeKpiProgress(value: number | null | undefined, target: number | undefined): number | undefined {
  if (value == null || target === undefined || !Number.isFinite(value) || !(target > 0)) return undefined;
  return Math.max(0, value / target);
}

/**
 * Responsive row of KPI tiles: value, change vs the comparison period, sparkline and
 * progress toward a target — the dashboard header of Stripe- and Vercel-style apps.
 */
export const KpiGroup = withRef(function KpiGroup({
  items,
  comparisonLabel,
  variant = 'joined',
  minTileWidth = 200,
  loading = false,
  skeletonCount = 4,
  locale: localeProp,
  labels: labelsProp,
  className,
  style,
  ...rest
}: KpiGroupProps) {
  const labels = { ...defaultKpiGroupLabels, ...labelsProp };
  const locale = useLocale(localeProp);
  const percent = useMemo(() => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }), [locale]);
  const wholePercent = useMemo(() => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }), [locale]);
  const tiles = loading && items.length === 0 ? Array.from({ length: skeletonCount }, (_, i) => ({ id: `skeleton-${i}` }) as KpiItem) : items;

  return (
    <ul
      role="list"
      aria-busy={loading || undefined}
      aria-label={loading ? labels.loading : undefined}
      {...rest}
      className={cx('ui-kpi-group', variant === 'joined' && 'ui-panel', className)}
      data-variant={variant}
      style={{ ['--_min' as string]: `${minTileWidth}px`, ...style } as CSSProperties}
    >
      {tiles.map((item) => {
        if (loading) {
          return (
            <li key={item.id} className={cx('ui-kpi-group__tile', variant === 'cards' && 'ui-panel')}>
              <Skeleton width="45%" height={14} />
              <Skeleton width="60%" height={28} />
              <Skeleton width="70%" height={12} />
            </li>
          );
        }
        const delta = item.delta ?? computeKpiDelta(item.value, item.previous);
        const hasDelta = delta !== undefined && Number.isFinite(delta);
        const tone: StatsTone = hasDelta ? getTrendTone(delta, item.invertTrend) : 'neutral';
        const direction = !hasDelta || Math.abs(delta) < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down';
        const TrendIcon = direction === 'up' ? TrendingUpIcon : direction === 'down' ? TrendingDownIcon : MinusIcon;
        const format = new Intl.NumberFormat(locale, item.format);
        const progress = computeKpiProgress(item.value, item.target);
        const caption = item.caption ?? comparisonLabel;
        const trend = item.trend?.filter((v) => v !== null && Number.isFinite(v));

        return (
          <li key={item.id} className={cx('ui-kpi-group__tile', variant === 'cards' && 'ui-panel')} data-tone={tone}>
            <div className="ui-kpi-group__head">
              <span className="ui-kpi-group__label">{item.label}</span>
              {item.icon && (
                <span className="ui-kpi-group__icon" aria-hidden="true">
                  {item.icon}
                </span>
              )}
            </div>
            <div className="ui-kpi-group__value">
              {item.value === null || !Number.isFinite(item.value) ? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="ui-sr-only">{labels.noData}</span>
                </>
              ) : (
                // Isolated, so "684 GB" or "$48,210" keeps its order inside right-to-left layouts.
                <bdi>{format.format(item.value)}</bdi>
              )}
            </div>
            {(hasDelta || caption) && (
              <div className="ui-kpi-group__meta">
                {hasDelta && (
                  <span className="ui-kpi-group__delta">
                    <TrendIcon size={14} strokeWidth={2} />
                    <span className="ui-sr-only">
                      {direction === 'up' ? labels.increase : direction === 'down' ? labels.decrease : labels.unchanged}{' '}
                    </span>
                    {percent.format(Math.abs(delta) / 100)}
                  </span>
                )}
                {caption && <span className="ui-kpi-group__caption">{caption}</span>}
              </div>
            )}
            {progress !== undefined && (
              <div className="ui-kpi-group__target" data-complete={progress >= 1 || undefined}>
                <span className="ui-kpi-group__target-bar" aria-hidden="true">
                  <span style={{ inlineSize: `${Math.min(1, progress) * 100}%` }} />
                </span>
                <span className="ui-kpi-group__target-text">
                  {labels.ofTarget(wholePercent.format(progress), format.format(item.target as number))}
                </span>
              </div>
            )}
            {trend && trend.length > 1 && (
              <Sparkline
                className="ui-kpi-group__spark"
                data={trend}
                variant="area"
                width={240}
                height={40}
                color="var(--_line)"
                preserveAspectRatio="none"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
});
