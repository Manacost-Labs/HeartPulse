import type { MetaReportRunResult, MetaReportSnapshot, MetaReportSources } from './contract.js';
import { hasReportableStandard, readMetaReportSections } from './projection.js';
import { MetaReportSnapshotStore } from './store.js';

export type {
  MetaReportArena, MetaReportBattlegrounds, MetaReportMatchups, MetaReportPatch, MetaReportRunResult, MetaReportSection,
  MetaReportSectionStatus, MetaReportSnapshot, MetaReportSources, MetaReportStandard,
} from './contract.js';

/** Monday, UTC: after the Arena and Battlegrounds refreshes of about 06:00. */
const DUE_MINUTE_OF_DAY = 6 * 60 + 30;
const HOUR_MS = 60 * 60_000;

/** The date a snapshot taken at `now` belongs to, or `null` outside Monday 06:30–24:00 UTC. */
function dueDate(now: number): string | null {
  const moment = new Date(now);
  if (moment.getUTCDay() !== 1 || moment.getUTCHours() * 60 + moment.getUTCMinutes() < DUE_MINUTE_OF_DAY) return null;
  return moment.toISOString().slice(0, 10);
}

export type MetaReportSnapshots = {
  /** Takes the day's snapshot when it is due and missing. Idempotent; never rejects. */
  run: () => Promise<MetaReportRunResult>;
  /** Snapshot dates, newest first. */
  list: () => string[];
  get: (date: string) => MetaReportSnapshot | null;
  close: () => void;
};

/**
 * Weekly snapshots of the open meta for the report (docs/specs/meta-report-snapshots.md).
 * With `hourly` the process checks every hour whether Monday's snapshot is due, so
 * a restart or a failed source on Monday morning is retried the same day. A missed
 * Monday is never written later: the date of a snapshot is always the day it is taken.
 */
export function createMetaReportSnapshots(options: {
  stateDirectory: string;
  sources: MetaReportSources;
  hourly?: boolean;
  now?: () => number;
  onError?: (error: unknown) => void;
}): MetaReportSnapshots {
  const now = options.now ?? Date.now;
  const store = new MetaReportSnapshotStore({ stateDirectory: options.stateDirectory });
  let running: Promise<MetaReportRunResult> | null = null;

  const take = async (): Promise<MetaReportRunResult> => {
    const date = dueDate(now());
    if (!date) return 'not-due';
    if (store.has(date)) return 'exists';
    const sections = await readMetaReportSections(options.sources, now());
    if (!hasReportableStandard(sections)) return 'standard-unavailable';
    const snapshot: MetaReportSnapshot = { schemaVersion: 1, date, recordedAt: new Date(now()).toISOString(), sections };
    return store.insert(snapshot) ? 'recorded' : 'exists';
  };

  const run = (): Promise<MetaReportRunResult> => {
    // One run at a time: the startup check and the hourly one never read the sources twice.
    running ??= take()
      .catch(error => {
        options.onError?.(error);
        return 'failed' as const;
      })
      .finally(() => { running = null; });
    return running;
  };

  if (options.hourly) {
    const tick = () => run().then(result => {
      if (result === 'standard-unavailable') options.onError?.(new Error('Standard meta is stale or too small: no meta report snapshot yet'));
    });
    setTimeout(tick, 3 * 60_000).unref();
    setInterval(tick, HOUR_MS).unref();
  }
  return { run, list: () => store.list(), get: date => store.get(date), close: () => store.close() };
}
