import { formatDate, startOfDay } from '../primitives';

/** Anything `new Date()` accepts; components take this for timestamps. */
export type DateInput = Date | string | number;

/** The date, or null when the input is missing or unparseable (formatting an invalid Date throws). */
export function parseDate(value: DateInput | undefined): Date | null {
  if (value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DAY = 86_400_000;

export function formatBytes(bytes: number, locale?: string) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/**
 * Token counts the way AI tools print them, in the locale's compact notation: 950, 12.4K, 1.2M in English,
 * «12,4 тыс.», «1,2 млн» in Russian. One decimal below 100 of a unit.
 */
export function formatTokens(count: number, locale?: string) {
  const abs = Math.abs(count);
  const divisor = abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  const digits = divisor === 1 || abs / divisor >= 100 ? 0 : 1;
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: digits }).format(count);
}

/** Grouped number; compact ("12K") from 10,000. Pass a shared `scale` so related numbers use one notation. */
export function formatNumber(value: number, locale?: string, scale = value) {
  return new Intl.NumberFormat(locale, {
    notation: Math.abs(scale) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

/** Currency with extra precision for sub-dollar amounts, where per-request AI costs live. */
export function formatCurrency(amount: number, currency = 'USD', locale?: string) {
  const small = amount !== 0 && Math.abs(amount) < 1;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: small ? 4 : 2,
  }).format(amount);
}

/** Plan prices: whole amounts without cents ("$20"), others with ("$19.50"). */
export function formatPrice(amount: number, currency = 'USD', locale?: string) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['week', 7 * 86_400],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "now", "5 minutes ago", "yesterday", "in 3 days". */
export function formatRelativeTime(date: Date, now: Date = new Date(), locale?: string) {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(seconds) < 45) return rtf.format(0, 'second');
  // A day or more away and within a week: count calendar days, like the feed's day headers do, so an event
  // 25 hours back under "Wednesday" never reads "yesterday".
  if (Math.abs(seconds) >= 86_400 && Math.abs(seconds) < 7 * 86_400) {
    return rtf.format(calendarDaysBetween(now, date), 'day');
  }
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds / 60), 'minute');
}

/** Whole calendar days from `now` to `date` (negative in the past). */
export function calendarDaysBetween(now: Date, date: Date) {
  // Rounding absorbs the 23/25-hour days around DST switches.
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY);
}

const capitalize = (text: string, locale?: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

/** Day header label: "Today", "Yesterday", a weekday within the last week, else a date. */
export function formatDayLabel(date: Date, now: Date = new Date(), locale?: string) {
  const days = calendarDaysBetween(now, date);
  if (days === 0 || days === -1) {
    return capitalize(new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day'), locale);
  }
  if (days < 0 && days > -7) return capitalize(formatDate(date, locale, { weekday: 'long' }), locale);
  return formatDate(date, locale, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export type QuotaStatus = 'ok' | 'warning' | 'danger';

/** Usage percentage and threshold status: ≥80% warning, ≥100% danger. */
export function getQuotaStatus(used: number, limit: number): { percent: number; status: QuotaStatus } {
  const percent = limit > 0 ? (used / limit) * 100 : used > 0 ? 100 : 0;
  return { percent, status: percent >= 100 ? 'danger' : percent >= 80 ? 'warning' : 'ok' };
}

export const quotaColor = { ok: 'accent', warning: 'warning', danger: 'danger' } as const;

const formatUnit = (value: number, name: 'millisecond' | 'second' | 'minute' | 'hour', locale?: string, digits = 0) =>
  new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'narrow', maximumFractionDigits: digits }).format(value);

/**
 * Short elapsed time the way AI tools print it: "340ms", "1.2s", "12s", "2m 5s", "1h 4m".
 * Built from Intl unit formats (not Intl.DurationFormat) so server and browser render the same text.
 */
export function formatDuration(ms: number, locale?: string) {
  const value = Math.max(0, ms);
  if (value < 1000) return formatUnit(Math.round(value), 'millisecond', locale);
  if (value < 10_000) return formatUnit(Math.floor(value / 100) / 10, 'second', locale, 1);
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return formatUnit(seconds, 'second', locale);
  const list = new Intl.ListFormat(locale, { type: 'unit', style: 'narrow' });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return list.format(rest ? [formatUnit(minutes, 'minute', locale), formatUnit(rest, 'second', locale)] : [formatUnit(minutes, 'minute', locale)]);
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return list.format(rest ? [formatUnit(hours, 'hour', locale), formatUnit(rest, 'minute', locale)] : [formatUnit(hours, 'hour', locale)]);
}
