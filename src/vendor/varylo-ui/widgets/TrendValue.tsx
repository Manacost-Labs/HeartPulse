'use client';

import type { ComponentPropsWithRef } from 'react';
import { cx } from '../primitives';
import { useLocale } from '../theme/ThemeProvider';
import { formatNumber, type NumberFormat } from './utils';
import './TrendValue.css';

export interface TrendValueLabels {
  /** Read before a rise by screen readers (the arrow and color are not announced). */
  increase: string;
  decrease: string;
  unchanged: string;
  /** Read when the value is missing (NaN, Infinity); a dash is shown. */
  unknown: string;
}

const DEFAULT_LABELS: TrendValueLabels = {
  increase: 'Up',
  decrease: 'Down',
  unchanged: 'No change',
  unknown: 'No data',
};

export type TrendDirection = 'up' | 'down' | 'flat';

export interface TrendValueProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  /** The change: +62000, −0.033 (with `percent`). Its sign picks the direction. */
  value: number;
  /** How the change is printed; `percent` takes a share of one (0.33 prints +33%). */
  format?: NumberFormat;
  /** ISO 4217 code for `currency` and compact money. */
  currency?: string;
  /** Fixed number of fraction digits. */
  fractionDigits?: number;
  /** Overrides the direction taken from the sign (a flat arrow for a tiny change, for example). */
  direction?: TrendDirection;
  /** A fall is good news (costs, latency, churn): the colors swap, the arrow does not. */
  invert?: boolean;
  /** `text`: colored figure; `badge`: a tinted pill, as on KPI cards. Default `text`. */
  variant?: 'text' | 'badge';
  /** Shows the arrow before the figure. Default true for `badge`, false for `text`. */
  showIcon?: boolean;
  /** Text size. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
  /** BCP 47 locale. Default: the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  labels?: Partial<TrendValueLabels>;
}

export function TrendValue({
  value,
  format = 'number',
  currency,
  fractionDigits,
  direction: directionProp,
  invert = false,
  variant = 'text',
  showIcon,
  size = 'md',
  locale: localeProp,
  labels,
  className,
  ...rest
}: TrendValueProps) {
  const locale = useLocale(localeProp);
  const copy = { ...DEFAULT_LABELS, ...labels };
  // A missing value is neither growth nor "no change": a neutral dash, read as "no data".
  const known = Number.isFinite(value);
  const direction: TrendDirection = known ? (directionProp ?? (value > 0 ? 'up' : value < 0 ? 'down' : 'flat')) : 'flat';
  const tone = direction === 'flat' ? 'neutral' : (direction === 'up') !== invert ? 'positive' : 'negative';
  const text = known ? formatNumber(value, locale, { format, currency, fractionDigits, signDisplay: 'exceptZero' }) : '—';
  const icon = (showIcon ?? variant === 'badge') && known;
  const spoken = !known ? copy.unknown : direction === 'up' ? copy.increase : direction === 'down' ? copy.decrease : copy.unchanged;
  return (
    <span className={cx('ui-trend-value', className)} data-direction={direction} data-tone={tone} data-variant={variant} data-size={size} {...rest}>
      {icon && (
        <svg className="ui-trend-value__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
      <span className="ui-sr-only">{spoken} </span>
      <span className="ui-trend-value__text">{text}</span>
    </span>
  );
}
