import type { ReactNode } from 'react';
import type { DateInput } from '../commerce/utils';

export type { DateInput } from '../commerce/utils';
export { formatCompactNumber, formatInteger, timeAttributes } from '../commerce/utils';

/** Level of a component's own heading (h1–h6). */
export type EditorialHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** A writer credited on an article, card or comment. */
export interface ArticleAuthor {
  name: string;
  /** Desk or position: "Senior editor", "Photo". */
  role?: ReactNode;
  avatarSrc?: string;
  /** Author page; the name becomes a link. */
  href?: string;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(locale: string | undefined, timeZone: string | undefined, key: string, options: Intl.DateTimeFormatOptions) {
  const id = `${locale ?? ''}|${timeZone ?? ''}|${key}`;
  let format = formats.get(id);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    formats.set(id, format);
  }
  return format;
}

const toTime = (input: DateInput) => new Date(input).getTime();

/**
 * Day, month and year. Always with the year: leaving out the current one would make the text depend on the
 * clock (a server and a browser on either side of New Year disagree) and change from one year to the next.
 */
const dayMonth: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/** Publication date as a reader expects it in a byline: "14 October 2026". */
export function formatArticleDate(input: DateInput, locale?: string, timeZone?: string) {
  const time = toTime(input);
  if (Number.isNaN(time)) return '';
  return dateFormat(locale, timeZone, 'date', dayMonth).format(time);
}

/** The same date with the time of day, for updates and corrections: "14 October 2026 at 18:05". */
export function formatArticleDateTime(input: DateInput, locale?: string, timeZone?: string) {
  const time = toTime(input);
  if (Number.isNaN(time)) return '';
  return dateFormat(locale, timeZone, 'date-time', { ...dayMonth, hour: '2-digit', minute: '2-digit' }).format(time);
}

/** Time of day only, for live-blog entries posted today: "18:05". */
export function formatClock(input: DateInput, locale?: string, timeZone?: string) {
  const time = toTime(input);
  return Number.isNaN(time) ? '' : dateFormat(locale, timeZone, 'clock', { hour: '2-digit', minute: '2-digit' }).format(time);
}

/** Machine-readable value for a <time> element. */
export function isoDate(input: DateInput) {
  const time = toTime(input);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/** Calendar day ("2026-10-15") in `timeZone` (default: the viewer's), for "is it today" checks. */
export function dayKey(input: DateInput, timeZone?: string) {
  const time = toTime(input);
  return Number.isNaN(time) ? '' : dateFormat('en-CA', timeZone, 'day', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
}
/** Joins names as a sentence: "A", "A and B", "A, B and C". */
export function joinNames<T>(items: T[], and: string, render: (item: T, index: number) => ReactNode): ReactNode[] {
  return items.flatMap((item, index) => {
    const separator = index === 0 ? null : index === items.length - 1 ? ` ${and} ` : ', ';
    return separator ? [separator, render(item, index)] : [render(item, index)];
  });
}
