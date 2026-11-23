import { createHash } from 'node:crypto';
import { canonicalSitemapOrigin } from './entitySitemapProjections.js';
import type { SitemapSemanticEntry } from './entitySitemapTypes.js';
import { isEarlyMetaReport, isIndexableMetaReportArchive } from '../shared/metaReportIndexing.js';

// The `meta-reports` segment: the weekly meta reports `/reports/meta/<date>/` that the page itself answers as
// indexable, and the archive `/reports/meta/` while it lists at least two reports. The pages and the segment decide
// with the same functions (`shared/metaReportIndexing.ts`) over the same snapshots (`GET /api/meta-reports`).

/** The part of the snapshot store the segment reads (`MetaReportSnapshots`): dates newest first, one snapshot by date. */
export type MetaReportSitemapSource = {
  list: () => string[];
  get: (date: string) => { recordedAt: string; sections: { patch: { data: { publishedAt: string } | null } } } | null;
};

export type MetaReportSitemapRow =
  | { kind: 'report'; date: string }
  /** `reports` counts every report on record, early ones too: the archive lists them all. */
  | { kind: 'archive'; reports: number; newestDate: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: unknown): value is string {
  return typeof value === 'string' && DATE.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

/**
 * Rows of `meta-reports.xml` from the snapshots on record. A report whose patch is younger than 72 hours at the
 * snapshot is `noindex, follow` on its page and stays out; the archive is listed once it has two reports. A report
 * is immutable once recorded, so its answer is remembered. A store that cannot be read rejects the candidate
 * and the last good segment stays.
 */
export function createMetaReportRowsLoader(source: MetaReportSitemapSource): () => Promise<MetaReportSitemapRow[]> {
  const early = new Map<string, boolean>();
  const isEarly = (date: string): boolean => {
    const known = early.get(date);
    if (known !== undefined) return known;
    const snapshot = source.get(date);
    // A date the store lists but cannot read is a 404 page: it is not listed, and not remembered.
    if (!snapshot) return true;
    const result = isEarlyMetaReport(snapshot.recordedAt, snapshot.sections.patch.data?.publishedAt);
    early.set(date, result);
    return result;
  };
  return async () => {
    const dates = source.list().filter(validDate);
    const rows: MetaReportSitemapRow[] = dates.filter(date => !isEarly(date)).map(date => ({ kind: 'report', date }));
    if (isIndexableMetaReportArchive(dates.length)) rows.push({ kind: 'archive', reports: dates.length, newestDate: dates[0] });
    return rows;
  };
}

/**
 * Sitemap entries of the report pages. A report is keyed by its date and dated by it (`lastmod` is the day of the
 * snapshot, never the day the server noticed it); the archive is dated by its newest report and changes its hash
 * with every report it lists. An archive below two reports is a wiring mistake and rejects the whole candidate.
 */
export function projectMetaReportSitemapCatalog(rows: unknown[], originValue?: string): SitemapSemanticEntry[] {
  if (!Array.isArray(rows)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return rows.map((raw): SitemapSemanticEntry => {
    const row = raw as Partial<MetaReportSitemapRow> & { date?: unknown; newestDate?: unknown; reports?: unknown };
    if (row.kind === 'report' && validDate(row.date)) {
      return { key: row.date, location: `${origin}/reports/meta/${row.date}/`, semanticHash: hash({ date: row.date }), dataDate: row.date };
    }
    if (row.kind === 'archive' && validDate(row.newestDate) && typeof row.reports === 'number' && isIndexableMetaReportArchive(row.reports)) {
      return { key: 'archive', location: `${origin}/reports/meta/`, semanticHash: hash({ reports: row.reports, newest: row.newestDate }), dataDate: row.newestDate };
    }
    throw new Error('Meta report sitemap catalog contains a page that is not indexable');
  }).sort((left, right) => left.key.localeCompare(right.key, 'en'));
}
