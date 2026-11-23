/**
 * Which weekly meta report pages are offered to search engines
 * (docs/specs/seo-entity-indexing.md, «Мета-отчёты»; docs/specs/meta-report-snapshots.md).
 *
 * One rule for every reader: the Next.js pages put these functions in their meta robots and
 * JSON-LD, and the `meta-reports` segment of the sitemap lists the same addresses with them.
 */

/** A patch younger than this at the snapshot gives early, unsettled data: the report stays `noindex, follow`. */
export const META_REPORT_EARLY_PATCH_MS = 72 * 60 * 60_000;

/** The archive `/reports/meta/` is an index of its own only once it lists at least this many reports. */
export const META_REPORT_ARCHIVE_MIN_REPORTS = 2;

/** The patch of the snapshot came out less than 72 hours before it was taken (an unreadable date is not early). */
export function isEarlyMetaReport(recordedAt: string, patchPublishedAt: string | null | undefined): boolean {
  const taken = Date.parse(recordedAt);
  const released = Date.parse(patchPublishedAt ?? '');
  return Number.isFinite(taken) && Number.isFinite(released) && taken - released >= 0 && taken - released < META_REPORT_EARLY_PATCH_MS;
}

export function isIndexableMetaReportArchive(reportCount: number): boolean {
  return reportCount >= META_REPORT_ARCHIVE_MIN_REPORTS;
}
