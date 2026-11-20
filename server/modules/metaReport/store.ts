import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { MetaReportSnapshot } from './contract.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseSnapshot(payload: unknown): MetaReportSnapshot | null {
  try {
    const value = JSON.parse(String(payload)) as MetaReportSnapshot;
    return value && value.schemaVersion === 1 && DATE.test(value.date) && value.sections ? value : null;
  } catch {
    return null;
  }
}

/**
 * Weekly snapshots in `<stateDirectory>/meta-report-snapshots-v1/snapshots.sqlite`,
 * one row per date. Append-only: triggers abort every UPDATE and DELETE, so a
 * published report keeps its figures; a correction is a separate dated note.
 */
export class MetaReportSnapshotStore {
  private readonly database: DatabaseSync;

  constructor(options: { stateDirectory: string }) {
    const directory = join(options.stateDirectory, 'meta-report-snapshots-v1');
    mkdirSync(directory, { recursive: true });
    this.database = new DatabaseSync(join(directory, 'snapshots.sqlite'));
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS weekly_snapshots (
        date TEXT NOT NULL PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        recorded_at TEXT NOT NULL,
        payload TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TRIGGER IF NOT EXISTS weekly_snapshots_no_update BEFORE UPDATE ON weekly_snapshots
      BEGIN SELECT RAISE(ABORT, 'meta report snapshots are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS weekly_snapshots_no_delete BEFORE DELETE ON weekly_snapshots
      BEGIN SELECT RAISE(ABORT, 'meta report snapshots are append-only'); END;
      -- INSERT OR REPLACE deletes the old row without firing the delete trigger.
      CREATE TRIGGER IF NOT EXISTS weekly_snapshots_no_replace BEFORE INSERT ON weekly_snapshots
      WHEN EXISTS (SELECT 1 FROM weekly_snapshots WHERE date = NEW.date)
      BEGIN SELECT RAISE(ABORT, 'meta report snapshots are append-only'); END;
    `);
  }

  /** Writes the snapshot of a date that has none; `false` when the date is already on record. */
  insert(snapshot: MetaReportSnapshot): boolean {
    if (!DATE.test(snapshot.date)) return false;
    // Inserts no row at all for a known date, so the replace guard never fires on a repeated run.
    const result = this.database.prepare(`
      INSERT INTO weekly_snapshots (date, recorded_at, payload)
      SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM weekly_snapshots WHERE date = ?)
    `).run(snapshot.date, snapshot.recordedAt, JSON.stringify(snapshot), snapshot.date);
    return Number(result.changes) > 0;
  }

  has(date: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM weekly_snapshots WHERE date = ?').get(date));
  }

  /** Dates on record, newest first. */
  list(): string[] {
    return (this.database.prepare('SELECT date FROM weekly_snapshots ORDER BY date DESC').all() as { date: string }[])
      .map(row => row.date);
  }

  get(date: string): MetaReportSnapshot | null {
    if (!DATE.test(date)) return null;
    const row = this.database.prepare('SELECT payload FROM weekly_snapshots WHERE date = ?').get(date) as { payload: string } | undefined;
    return row ? parseSnapshot(row.payload) : null;
  }

  close(): void {
    this.database.close();
  }
}
