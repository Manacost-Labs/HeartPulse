/**
 * The audience's zone: most viewers see no change once their own applies.
 * Dates in server-rendered views, including the date of the data in page
 * metadata (apps/public-web/lib/seoDataDate.ts), are written in it. A plain
 * module, so server components can import it (`useViewerTimeZone` is a hook).
 */
export const SERVER_RENDER_TIME_ZONE = 'Europe/Moscow';
