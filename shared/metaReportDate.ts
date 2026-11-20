/**
 * The date of a weekly meta report, `YYYY-MM-DD` (docs/specs/meta-report-snapshots.md): a real
 * calendar date, so `2026-02-30` is not one. The Express routes and the report pages accept the same set.
 */
export function isMetaReportDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
