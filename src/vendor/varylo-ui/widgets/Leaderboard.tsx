'use client';

import { createElement, useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx, useControllableState } from '../primitives';
import { StarIcon } from '../icons';
import { useLocale } from '../theme/ThemeProvider';
import { SegmentedControl } from '../navigation/SegmentedControl';
import { formatNumber, type WidgetHeadingLevel } from './utils';
import './Leaderboard.css';

export interface LeaderboardItem {
  id: string;
  title: ReactNode;
  /** Muted line: a category, an author. */
  subtitle?: ReactNode;
  imageSrc?: string;
  /** Icon in the thumbnail when there is no image. */
  icon?: ReactNode;
  /** Average rating out of 5, after the subtitle. */
  rating?: number;
  /** Main figure at the end: a price, a score. */
  value?: ReactNode;
  /** Muted figure under or beside it: units sold. */
  secondary?: ReactNode;
  /** Movement since the last period. */
  trend?: 'up' | 'down' | 'flat';
  href?: string;
}

export interface LeaderboardLabels {
  /** Read before the place number: "Rank 1". */
  rank: (place: number) => string;
  up: string;
  down: string;
  flat: string;
  /** Accessible name of the period switcher. */
  period: string;
}

const DEFAULT_LABELS: LeaderboardLabels = {
  rank: (place) => `Rank ${place}`,
  up: 'Rising',
  down: 'Falling',
  flat: 'No change',
  period: 'Period',
};

export interface LeaderboardProps extends Omit<ComponentPropsWithRef<'section'>, 'children' | 'title'> {
  /** Ranked entries, first place first. */
  items: LeaderboardItem[];
  /** Heading of the board. */
  title?: ReactNode;
  /** Icon before the heading. */
  icon?: ReactNode;
  /** Period choices shown as a switcher in the header. */
  periods?: { value: string; label: string }[];
  /** Chosen period (controlled). */
  period?: string;
  defaultPeriod?: string;
  onPeriodChange?: (period: string) => void;
  /** Gold, silver and bronze dots on the top three. Default true. */
  medals?: boolean;
  /** Note under the list: "Updated hourly". */
  footer?: ReactNode;
  /** Level of the heading (default 3). */
  headingLevel?: WidgetHeadingLevel;
  /** BCP 47 locale for the rank and rating numbers. */
  locale?: string;
  labels?: Partial<LeaderboardLabels>;
}

function Trend({ direction, label }: { direction: 'up' | 'down' | 'flat'; label: string }) {
  return (
    <span className="ui-leaderboard__trend" data-direction={direction} role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={direction === 'flat' ? 'M6 12h12' : 'M12 19V5M6 11l6-6 6 6'} />
      </svg>
    </span>
  );
}

export function Leaderboard({
  items,
  title,
  icon,
  periods = [],
  period: periodProp,
  defaultPeriod,
  onPeriodChange,
  medals = true,
  footer,
  headingLevel = 3,
  locale: localeProp,
  labels,
  className,
  ...rest
}: LeaderboardProps) {
  const locale = useLocale(localeProp);
  const copy = { ...DEFAULT_LABELS, ...labels };
  const titleId = useId();
  const [period, setPeriod] = useControllableState({ value: periodProp, defaultValue: defaultPeriod ?? periods[0]?.value ?? '', onChange: onPeriodChange });
  return (
    <section className={cx('ui-leaderboard', className)} aria-labelledby={title != null ? titleId : undefined} {...rest}>
      {(title != null || periods.length > 0) && (
        <header className="ui-leaderboard__header">
          {title != null && (
            <div className="ui-leaderboard__title-row">
              {icon != null && (
                <span className="ui-leaderboard__icon" aria-hidden="true">
                  {icon}
                </span>
              )}
              {createElement(`h${headingLevel}`, { id: titleId, className: 'ui-leaderboard__title' }, title)}
            </div>
          )}
          {periods.length > 0 && <SegmentedControl size="sm" aria-label={copy.period} options={periods} value={period} onValueChange={setPeriod} />}
        </header>
      )}
      <ol className="ui-leaderboard__list">
        {items.map((item, index) => {
          const place = index + 1;
          const medal = medals && place <= 3 ? (['gold', 'silver', 'bronze'] as const)[index] : undefined;
          const body = (
            <>
              <span className="ui-leaderboard__place">
                <span className="ui-sr-only">{copy.rank(place)} </span>
                <span aria-hidden="true">{formatNumber(place, locale)}</span>
                {medal && <span className="ui-leaderboard__medal" data-medal={medal} aria-hidden="true" />}
              </span>
              <span className="ui-leaderboard__thumb" aria-hidden="true">
                {item.imageSrc ? <img src={item.imageSrc} alt="" loading="lazy" decoding="async" /> : item.icon}
              </span>
              <span className="ui-leaderboard__text">
                <span className="ui-leaderboard__item-title">{item.title}</span>
                {(item.subtitle != null || item.rating !== undefined) && (
                  <span className="ui-leaderboard__subtitle">
                    {item.subtitle}
                    {item.subtitle != null && item.rating !== undefined && <span aria-hidden="true"> · </span>}
                    {item.rating !== undefined && (
                      <span className="ui-leaderboard__rating">
                        <StarIcon size={13} />
                        {formatNumber(item.rating, locale, { fractionDigits: 1 })}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span className="ui-leaderboard__figures">
                {item.value != null && <span className="ui-leaderboard__value">{item.value}</span>}
                {item.secondary != null && <span className="ui-leaderboard__secondary">{item.secondary}</span>}
              </span>
              {item.trend && <Trend direction={item.trend} label={copy[item.trend]} />}
            </>
          );
          return (
            <li key={item.id} className="ui-leaderboard__item">
              {item.href ? (
                <a className="ui-leaderboard__row" href={item.href}>
                  {body}
                </a>
              ) : (
                <div className="ui-leaderboard__row">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {footer != null && <footer className="ui-leaderboard__footer">{footer}</footer>}
    </section>
  );
}
