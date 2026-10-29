import { SERVER_RENDER_TIME_ZONE } from '@/src/shared/ui/serverRenderTimeZone';

/** Data older than this is shown with its date («обновлено …») and leaves the month out of the title. */
export const SEO_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
// A source clock a day ahead is tolerated; further ahead the date cannot be trusted.
const SEO_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export type SeoDataDate = {
  /** The normalized `updatedAt`, for `<time datetime>`. */
  iso: string;
  /** «октябрь 2026» */
  month: string;
  /** «29 октября 2026» */
  date: string;
  /** «02:00», in the audience's zone (Moscow) */
  time: string;
  /** Older than a week: the title leaves the month out and the description says «обновлено». */
  stale: boolean;
};

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: SERVER_RENDER_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/**
 * The date of the data for metadata and the visible data note: month, full
 * date and time in the audience's zone (`SERVER_RENDER_TIME_ZONE`, the zone
 * server-rendered times use), never the server's own clock. `now` is the
 * moment that decides whether the data is stale. `null` for a missing or
 * unreadable date, or one more than a day ahead of `now`.
 */
export function seoDataDate(updatedAt: string | null | undefined, now: number): SeoDataDate | null {
  if (!updatedAt) return null;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp) || timestamp - now > SEO_FUTURE_TOLERANCE_MS) return null;
  const at = Object.fromEntries(parts.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  const month = Number(at.month) - 1;
  return {
    iso: new Date(timestamp).toISOString(),
    month: `${MONTHS[month]} ${at.year}`,
    date: `${Number(at.day)} ${MONTHS_GENITIVE[month]} ${at.year}`,
    time: `${at.hour}:${at.minute}`,
    stale: now - timestamp > SEO_STALE_AFTER_MS,
  };
}

/**
 * The `month` and `asOf` tokens of the data templates (src/seo/registry.ts).
 * Stale data has no month, so a title that needs it falls back to the page's
 * static one.
 */
export function seoDateValues(date: SeoDataDate): { month: string | null; asOf: string } {
  return date.stale
    ? { month: null, asOf: `, обновлено ${date.date}` }
    : { month: date.month, asOf: ` на ${date.date}` };
}
