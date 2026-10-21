'use client';

import { useLocale } from '../theme/ThemeProvider';
import { Badge } from '../basic/Badge';
import { ProgressBar } from '../basic/ProgressBar';
import { formatNumber, getQuotaStatus, quotaColor } from './format';
import './QuotaMeter.css';

export interface QuotaMeterLabels {
  overLimit: string;
  limitReached: string;
}

export const QUOTA_METER_LABELS: QuotaMeterLabels = { overLimit: 'Over limit', limitReached: 'Limit reached' };

interface QuotaMeterProps {
  label: string;
  used: number;
  limit: number;
  unit?: string;
  format?: (value: number) => string;
  variant?: 'default' | 'compact';
  locale?: string;
  labels: QuotaMeterLabels;
}

/** One usage meter (label, used / limit, threshold-colored bar), shared by UsageQuota and BillingPlanCard. */
export function QuotaMeter({
  label,
  used,
  limit,
  unit,
  locale: localeProp,
  format: formatProp,
  variant = 'default',
  labels,
}: QuotaMeterProps) {
  const locale = useLocale(localeProp);
  const format = formatProp ?? ((v: number) => formatNumber(v, locale, Math.max(used, limit)));
  const { percent, status } = getQuotaStatus(used, limit);
  const limitText = status !== 'danger' ? null : used > limit ? labels.overLimit : labels.limitReached;

  return (
    <div className="ui-quota-meter" data-status={status} data-variant={variant}>
      {/* Label and badge share a wrapping row: on a narrow card the badge drops under the label instead of vanishing. */}
      <span className="ui-quota-meter__head">
        {/* The progressbar carries the label for assistive tech; this copy is visual only. */}
        <span className="ui-quota-meter__label" aria-hidden="true">
          {label}
        </span>
        {limitText && variant === 'default' && (
          <Badge size="sm" color="red" className="ui-quota-meter__badge" aria-hidden="true">
            {limitText}
          </Badge>
        )}
      </span>
      <span className="ui-quota-meter__value">
        <span className="ui-quota-meter__used">{format(used)}</span>
        <span className="ui-quota-meter__limit">
          {' / '}
          {format(limit)}
          {unit && ` ${unit}`}
        </span>
        {limitText && <span className="ui-sr-only"> ({limitText})</span>}
      </span>
      <ProgressBar
        className="ui-quota-meter__bar"
        label={label}
        size="sm"
        value={limit > 0 ? Math.min(used, limit) : percent / 100}
        max={limit > 0 ? limit : 1}
        color={quotaColor[status]}
      />
    </div>
  );
}
