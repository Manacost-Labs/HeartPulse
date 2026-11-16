import type { ChartPoint } from '../../../shared/ui/analytics/analyticsModel';
import type { StackRow, StackSeries } from '../../../shared/ui/analytics/StackedBarChart';
import { formatCount } from './subscriptionFormat';
import type { SubscriptionDailyPoint, SubscriptionWeeklyPoint } from './types';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «2026-09-12» → «12 сен»; нераспознанное возвращается как есть. */
export function formatShortDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  const month = match ? MONTHS_SHORT[Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month}` : date;
}

/** Дни метрик — UTC-даты; считаем по ним без часовых поясов браузера. */
const dayNumber = (date: string) => Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/** Тарифы по убыванию числа подписчиков в последний день; хвост за `limit` сливается в «Другие». */
export function rankPlans(daily: SubscriptionDailyPoint[], limit = 5): string[] {
  const last = daily.at(-1)?.plans ?? {};
  const names = new Set<string>(daily.flatMap(day => Object.keys(day.plans)));
  return [...names].sort((a, b) => (last[b] ?? 0) - (last[a] ?? 0) || a.localeCompare(b, 'ru')).slice(0, limit);
}

function planDetail(day: SubscriptionDailyPoint, plans: string[]): string {
  const parts = plans.filter(name => (day.plans[name] ?? 0) > 0).map(name => `${name} ${formatCount(day.plans[name])}`);
  const other = Object.entries(day.plans).filter(([name]) => !plans.includes(name)).reduce((sum, [, count]) => sum + count, 0);
  if (other > 0) parts.push(`Другие ${formatCount(other)}`);
  return parts.join(' · ');
}

/**
 * Точки линии «платные по дням». В день без наблюдений основная линия прерывается (`y: null`),
 * а перенесённое значение идёт пунктиром (`reference`) — база не «падает» и не «растёт» на пропуске.
 * Соседние наблюдаемые дни получают то же `reference`, чтобы пунктир касался линии.
 */
export function dailyChartPoints(daily: SubscriptionDailyPoint[], plans = rankPlans(daily)): ChartPoint[] {
  return daily.map((day, index) => {
    const touchesGap = !day.observed || daily[index - 1]?.observed === false || daily[index + 1]?.observed === false;
    const detail = day.observed
      ? `${planDetail(day, plans)} · +${formatCount(day.starts)} / −${formatCount(day.ends)}`
      : 'Опросов в этот день не было, значение перенесено с предыдущего дня';
    return {
      x: dayNumber(day.date),
      y: day.observed ? day.paid : null,
      label: day.observed ? formatShortDate(day.date) : `${formatShortDate(day.date)} — нет наблюдений`,
      tick: formatShortDate(day.date),
      detail,
      reference: touchesGap ? day.paid : null,
    };
  });
}

/** Подряд идущие дни без наблюдений: «12–14 сен», «25 сен». */
export function unobservedRanges(daily: SubscriptionDailyPoint[]): string[] {
  const ranges: string[] = [];
  let start: string | null = null;
  let end = '';
  const flush = () => {
    if (start !== null) ranges.push(start === end ? formatShortDate(start) : `${formatShortDate(start)} — ${formatShortDate(end)}`);
    start = null;
  };
  for (const day of daily) {
    if (day.observed) flush();
    else {
      start ??= day.date;
      end = day.date;
    }
  }
  flush();
  return ranges;
}

export function unobservedDayCount(daily: SubscriptionDailyPoint[]): number {
  return daily.filter(day => !day.observed).length;
}

const PLAN_COLORS = ['#c9923a', '#6f9f9c', '#a6bf88', '#b98a9a', '#8c86b8', '#a89f91'];
const DARK_TEXT = '#30251c';

/** Цвета и подписи серий для долей тарифов; «Другие» — серый. */
export function planSeries(daily: SubscriptionDailyPoint[], plans = rankPlans(daily)): StackSeries[] {
  const hasOther = daily.some(day => Object.keys(day.plans).some(name => !plans.includes(name)));
  const series = plans.map((name, index) => ({ key: name, label: name, color: PLAN_COLORS[index % PLAN_COLORS.length], textColor: DARK_TEXT }));
  return hasOther ? [...series, { key: '__other', label: 'Другие', color: PLAN_COLORS[PLAN_COLORS.length - 1], textColor: DARK_TEXT }] : series;
}

/**
 * Доли тарифов (в процентах) на `count` равномерно выбранных наблюдаемых днях, включая первый и последний.
 * Дни без наблюдений не берутся: их значения перенесены и доли на них ничего не показывают.
 */
export function planShareRows(daily: SubscriptionDailyPoint[], plans = rankPlans(daily), count = 6): StackRow[] {
  const observed = daily.filter(day => day.observed && day.paid > 0);
  if (!observed.length) return [];
  const picks = observed.length <= count
    ? observed
    : Array.from({ length: count }, (_, index) => observed[Math.round(index * (observed.length - 1) / (count - 1))]);
  return picks.map(day => {
    const values: Record<string, number> = {};
    let other = 0;
    for (const [name, amount] of Object.entries(day.plans)) {
      if (plans.includes(name)) values[name] = amount / day.paid * 100;
      else other += amount;
    }
    if (other > 0) values.__other = other / day.paid * 100;
    return { label: formatShortDate(day.date), values };
  });
}

/** Недели: начала доступа — основная линия, окончания — пунктир (`reference`); неполная неделя — отдельный сегмент с подписью. */
export function weeklyChartPoints(weekly: SubscriptionWeeklyPoint[]): ChartPoint[] {
  return weekly.map(week => ({
    x: dayNumber(week.weekStart),
    y: week.starts,
    reference: week.ends,
    label: `Неделя с ${formatShortDate(week.weekStart)}${week.partial ? ' (неполная)' : ''}`,
    tick: formatShortDate(week.weekStart),
    detail: 'Начали доступ',
    segment: week.partial ? 'partial' : 'full',
  }));
}

export const WEEKLY_SEGMENT_LABELS: Record<string, string> = { full: '', partial: 'неполная неделя' };
