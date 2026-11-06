import type { DatabaseSync } from 'node:sqlite';
import { CRASH_REPORT_KEEP_DAYS, CRASH_REPORT_MAX_ROWS, type CrashReport } from './report.js';

/** One row per report (its random id): no IP, no account, nothing about who sent it. */
export const CRASH_REPORT_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS crash_reports (
    id TEXT PRIMARY KEY,
    received_at INTEGER NOT NULL,
    version TEXT NOT NULL,
    ui TEXT NOT NULL,
    error_type TEXT NOT NULL,
    report_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_crash_reports_time ON crash_reports(received_at);
  CREATE INDEX IF NOT EXISTS idx_crash_reports_kind ON crash_reports(version, error_type);
`;

export type CrashReportRepository = {
  /** Stores the report, then drops the oldest past the ceiling; false when its id was already stored (a resend). */
  store: (report: CrashReport, now: number) => boolean;
  /** Deletes reports older than CRASH_REPORT_KEEP_DAYS; returns how many. */
  prune: (now: number) => number;
};

export function initializeCrashReportRepository(getDatabase: () => DatabaseSync): void {
  getDatabase().exec(CRASH_REPORT_TABLES_SQL);
}

export function createSqliteCrashReportRepository(getDatabase: () => DatabaseSync, maxRows = CRASH_REPORT_MAX_ROWS): CrashReportRepository {
  return {
    store(report, now) {
      const database = getDatabase();
      const stored = Number(database.prepare(`INSERT OR IGNORE INTO crash_reports (id, received_at, version, ui, error_type, report_json)
        VALUES (?, ?, ?, ?, ?, ?)`).run(report.id, now, report.version, report.ui, report.errors[0].type, JSON.stringify(report)).changes) > 0;
      if (stored) {
        // Past the ceiling the oldest reports go: a flood pushes out itself, not the reports that come after it.
        database.prepare(`DELETE FROM crash_reports WHERE rowid IN (SELECT rowid FROM crash_reports ORDER BY received_at, rowid
          LIMIT MAX((SELECT COUNT(*) FROM crash_reports) - ?, 0))`).run(maxRows);
      }
      return stored;
    },
    prune(now) {
      return Number(getDatabase().prepare('DELETE FROM crash_reports WHERE received_at < ?')
        .run(now - CRASH_REPORT_KEEP_DAYS * 86_400_000).changes);
    },
  };
}
