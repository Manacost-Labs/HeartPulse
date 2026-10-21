'use client';

import type { ComponentPropsWithRef } from 'react';
import { AlertTriangleIcon, CalendarIcon, ClockIcon, CreditCardIcon, ZapIcon } from '../icons';
import { cx, formatDate, useNow } from '../primitives';
import { useLocale } from '../theme/ThemeProvider';
import { Badge, type BadgeColor } from '../basic/Badge';
import { Button } from '../basic/Button';
import { calendarDaysBetween, formatPrice, parseDate, type DateInput } from './format';
import { QUOTA_METER_LABELS, QuotaMeter, type QuotaMeterLabels } from './QuotaMeter';
import './BillingPlanCard.css';
import { withRef } from '../primitives/react-compat';

export type BillingPlanStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export interface BillingPaymentMethod {
  /** Card brand, e.g. "Visa". */
  brand: string;
  last4: string;
  /** Expiry as printed on the card, e.g. "08/28". */
  expires?: string;
}

export interface BillingUsageItem {
  label: string;
  used: number;
  limit: number;
  unit?: string;
  format?: (value: number) => string;
}

export interface BillingPlanCardLabels extends QuotaMeterLabels {
  currentPlan: string;
  status: Record<BillingPlanStatus, string>;
  /** Suffix after the price, e.g. "/ month". */
  interval: Record<'month' | 'year', string>;
  /** Trial banner headline by whole days left (0 = last day, negative = ended). */
  trialStatus: (daysLeft: number) => string;
  /** Trial banner detail, given the formatted end date. */
  trialEnd: (date: string, ended: boolean) => string;
  pastDueTitle: string;
  pastDueDetail: string;
  renews: string;
  /** Date label while `status` is "past_due". */
  paymentDue: string;
  firstCharge: string;
  accessEnds: string;
  paymentMethod: string;
  /** Screen-reader text between the card brand and its last four digits. */
  cardEnding: string;
  /** Given the expiry as printed on the card. */
  expires: (expiry: string) => string;
  includedUsage: string;
  cancel: string;
  manage: string;
  upgrade: string;
  /** Upgrade button text during a trial. */
  upgradeTrial: string;
}

const DEFAULT_LABELS: BillingPlanCardLabels = {
  ...QUOTA_METER_LABELS,
  currentPlan: 'Current plan',
  status: { active: 'Active', trialing: 'Trial', past_due: 'Past due', canceled: 'Canceled' },
  interval: { month: '/ month', year: '/ year' },
  trialStatus: (days) =>
    days > 1 ? `${days} days left in your trial` : days === 1 ? '1 day left in your trial' : days === 0 ? 'Last day of your trial' : 'Trial ended',
  trialEnd: (date, ended) => (ended ? `ended ${date}` : `ends ${date}`),
  pastDueTitle: 'Payment failed',
  pastDueDetail: 'Update your payment method to keep access.',
  renews: 'Renews',
  paymentDue: 'Payment due',
  firstCharge: 'First charge',
  accessEnds: 'Access ends',
  paymentMethod: 'Payment method',
  cardEnding: 'ending in',
  expires: (expiry) => `Expires ${expiry}`,
  includedUsage: 'Included usage',
  cancel: 'Cancel plan',
  manage: 'Manage',
  upgrade: 'Upgrade',
  upgradeTrial: 'Upgrade now',
};

export interface BillingPlanCardProps extends Omit<ComponentPropsWithRef<'section'>, 'title'> {
  /** Plan name shown as the card heading. */
  plan: string;
  /** Subscription state: sets the status badge, the date label and a trial or past-due notice. */
  status?: BillingPlanStatus;
  /** Amount per `interval` in `currency`; whole amounts are shown without cents. */
  price: number;
  /** ISO 4217 code. Default USD. */
  currency?: string;
  /** Billing period, shown after the price. */
  interval?: 'month' | 'year';
  /** Next renewal, or the end of access for a canceled plan. */
  renewsAt?: DateInput;
  /** End of the trial; shows the days left while `status` is "trialing". */
  trialEndsAt?: DateInput;
  /** Card on file, shown masked to its last four digits with the expiry. */
  paymentMethod?: BillingPaymentMethod;
  /** Included usage, each shown as a meter. */
  usage?: BillingUsageItem[];
  /** Adds a primary Upgrade button ("Upgrade now" during a trial). */
  onUpgrade?: () => void;
  /** Adds a secondary Manage button. */
  onManage?: () => void;
  /** Adds a Cancel plan button, hidden once the plan is canceled. */
  onCancel?: () => void;
  /** BCP 47 locale for the price, dates and usage numbers; defaults to the ThemeProvider's. */
  locale?: string;
  labels?: Partial<BillingPlanCardLabels>;
}

const STATUS_COLOR: Record<BillingPlanStatus, BadgeColor> = {
  active: 'green',
  trialing: 'blue',
  past_due: 'amber',
  canceled: 'gray',
};

export const BillingPlanCard = withRef(function BillingPlanCard({
  plan,
  status = 'active',
  price,
  currency = 'USD',
  interval = 'month',
  renewsAt,
  trialEndsAt,
  paymentMethod,
  usage,
  onUpgrade,
  onManage,
  onCancel,
  locale: localeProp,
  labels,
  className,
  ...rest
}: BillingPlanCardProps) {
  const locale = useLocale(localeProp);
  const t = { ...DEFAULT_LABELS, ...labels };
  // Re-read hourly, so a page left open counts the trial days down.
  const now = new Date(useNow(3_600_000));
  const trialEnd = status === 'trialing' ? parseDate(trialEndsAt) : null;
  const renewal = parseDate(renewsAt);
  const trialDays = trialEnd ? calendarDaysBetween(now, trialEnd) : 0;

  return (
    <section {...rest} className={cx('ui-billing-plan-card ui-panel', className)} data-status={status}>
      <header className="ui-billing-plan-card__header">
        <div className="ui-billing-plan-card__plan">
          <span className="ui-billing-plan-card__eyebrow">{t.currentPlan}</span>
          <div className="ui-billing-plan-card__name-row">
            <h3 className="ui-billing-plan-card__name">{plan}</h3>
            <Badge size="sm" dot color={STATUS_COLOR[status]}>
              {t.status[status]}
            </Badge>
          </div>
        </div>
        <p className="ui-billing-plan-card__price">
          <span className="ui-billing-plan-card__amount">{formatPrice(price, currency, locale)}</span>
          <span className="ui-billing-plan-card__interval">{t.interval[interval]}</span>
        </p>
      </header>

      {trialEnd && (
        <div className="ui-billing-plan-card__notice" data-tone="info">
          <ClockIcon />
          {/* Days left depend on the reader's time zone, which the server may not share. */}
          <span suppressHydrationWarning>
            <strong suppressHydrationWarning>{t.trialStatus(trialDays)}</strong>
            {' · '}
            {/* The date never splits between month and day. */}
            <span className="ui-billing-plan-card__trial-end" suppressHydrationWarning>
              {t.trialEnd(formatDate(trialEnd, locale, { month: 'short', day: 'numeric' }), trialDays < 0)}
            </span>
          </span>
        </div>
      )}
      {status === 'past_due' && (
        <div className="ui-billing-plan-card__notice" data-tone="warning" role="alert">
          <AlertTriangleIcon />
          <span>
            <strong>{t.pastDueTitle}</strong> {t.pastDueDetail}
          </span>
        </div>
      )}

      {(renewal || paymentMethod) && (
        <dl className="ui-billing-plan-card__details">
          {renewal && (
            <div className="ui-billing-plan-card__detail">
              <dt>
                <CalendarIcon />
                {status === 'canceled'
                  ? t.accessEnds
                  : status === 'trialing'
                    ? t.firstCharge
                    : status === 'past_due'
                      ? t.paymentDue
                      : t.renews}
              </dt>
              <dd>{formatDate(renewal, locale, { dateStyle: 'long' })}</dd>
            </div>
          )}
          {paymentMethod && (
            <div className="ui-billing-plan-card__detail">
              <dt>
                <CreditCardIcon />
                {t.paymentMethod}
              </dt>
              <dd>
                <span className="ui-billing-plan-card__card">
                  {paymentMethod.brand} <span aria-hidden="true">••••</span>
                  <span className="ui-sr-only">{t.cardEnding}</span> {paymentMethod.last4}
                </span>
                {paymentMethod.expires && <span className="ui-billing-plan-card__expires">{t.expires(paymentMethod.expires)}</span>}
              </dd>
            </div>
          )}
        </dl>
      )}

      {usage && usage.length > 0 && (
        <div className="ui-billing-plan-card__usage">
          <h4 className="ui-billing-plan-card__section-title">{t.includedUsage}</h4>
          {usage.map((item) => (
            <QuotaMeter key={item.label} {...item} locale={locale} labels={t} />
          ))}
        </div>
      )}

      {(onUpgrade || onManage || onCancel) && (
        <footer className="ui-billing-plan-card__actions">
          {onCancel && status !== 'canceled' && (
            <Button variant="ghost" size="sm" className="ui-billing-plan-card__cancel" onClick={onCancel}>
              {t.cancel}
            </Button>
          )}
          <div className="ui-billing-plan-card__primary-actions">
            {onManage && (
              <Button variant="secondary" size="sm" onClick={onManage}>
                {t.manage}
              </Button>
            )}
            {onUpgrade && (
              <Button variant="primary" size="sm" leftIcon={<ZapIcon />} onClick={onUpgrade}>
                {status === 'trialing' ? t.upgradeTrial : t.upgrade}
              </Button>
            )}
          </div>
        </footer>
      )}
    </section>
  );
});
