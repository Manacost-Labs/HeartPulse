/** Small date helpers shared by pickers and calendars. All work in local time. */

export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Adds months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: Date, months: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

export function isSameDay(a: Date | null | undefined, b: Date | null | undefined) {
  return (
    !!a &&
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Inclusive day-level range check; order of `start`/`end` does not matter. */
export function isWithinRange(date: Date, start: Date, end: Date) {
  const t = startOfDay(date).getTime();
  const a = startOfDay(start).getTime();
  const b = startOfDay(end).getTime();
  return t >= Math.min(a, b) && t <= Math.max(a, b);
}

export function startOfWeek(date: Date, weekStartsOn: WeekStart = 1) {
  const diff = (date.getDay() - weekStartsOn + 7) % 7;
  return addDays(startOfDay(date), -diff);
}

/** 6×7 grid of days covering `month`, starting on `weekStartsOn`. */
export function getMonthGrid(month: Date, weekStartsOn: WeekStart = 1): Date[] {
  const first = startOfWeek(startOfMonth(month), weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Localised short weekday names in grid order. */
export function getWeekdayNames(locale?: string, weekStartsOn: WeekStart = 1, format: 'narrow' | 'short' = 'short') {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: format });
  // 2024-01-07 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + weekStartsOn + i)));
}

/** Month and year for a heading, without a trailing era marker: «октябрь 2026», not «октябрь 2026 г.». */
export function formatMonth(date: Date, locale?: string) {
  const parts = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).formatToParts(date);
  let end = parts.length;
  while (end > 0 && parts[end - 1].type === 'literal') end--;
  // Only a marker after the year goes («2026 г.»); a trailing month suffix stays («2026年10月»).
  if (parts[end - 1]?.type !== 'year') end = parts.length;
  return parts
    .slice(0, end)
    .map((part) => part.value)
    .join('');
}

export function formatDate(date: Date, locale?: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat(locale, options).format(date);
}
