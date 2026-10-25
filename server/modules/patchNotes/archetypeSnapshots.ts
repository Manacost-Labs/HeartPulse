import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decode } from '@firestone-hs/deckstrings';
import type { PatchNotesFormat } from './contract.js';

/*
 * Archetypes as they were on the day before a patch. A snapshot of the site's
 * archetype catalog is kept per format and Moscow day of its data; when a patch
 * of day D is out, the snapshot of D−1 is pinned to its version and never
 * changes afterwards. A patch without a D−1 snapshot has no archetypes at all,
 * rather than today's.
 */

/** The site's archetype catalog of one format, reduced to what a snapshot keeps. */
export type PatchArchetypeCatalog = {
  format: PatchNotesFormat;
  period?: string | null;
  updatedAt?: string | null;
  items: {
    slug: string;
    archetypeLabel: string;
    classKey?: string | null;
    popularity?: number | null;
    winrate?: number | null;
    games?: number | null;
    builds: { deckCode: string }[];
  }[];
};

/** One archetype of a day: what the page shows, and its builds as dbf lists (deck codes decoded once). */
export type PatchArchetypeSnapshotItem = {
  slug: string;
  name: string;
  classKey: string | null;
  popularity: number | null;
  winrate: number | null;
  games: number | null;
  builds: number[][];
};

export type PatchArchetypeSnapshot = {
  format: PatchNotesFormat;
  /** Moscow date of the data, `YYYY-MM-DD`. */
  day: string;
  /** When the source fetched the catalog. */
  recordedAt: string;
  period: string | null;
  items: PatchArchetypeSnapshotItem[];
};

export type PatchArchetypeSnapshotStorage = {
  record: (snapshot: PatchArchetypeSnapshot) => void;
  /** Pins the snapshots of `day` to `version`; a format already pinned keeps its snapshot. */
  pin: (version: string, day: string) => void;
  pinned: (version: string) => PatchArchetypeSnapshot[];
};

const DAY_MS = 24 * 60 * 60_000;
const MOSCOW_OFFSET_MS = 3 * 60 * 60_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FORMATS = new Set<PatchNotesFormat>(['standard', 'wild']);

/** Moscow has no daylight saving time since 2014, so its day is UTC+3. */
export function moscowDay(ms: number): string {
  return new Date(ms + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Moscow day of a patch; a timestamp without an offset is the article's Moscow time. */
export function patchDay(publishedAt: string | null | undefined): string | null {
  const value = String(publishedAt ?? '').trim();
  if (!value) return null;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) || !value.includes('T') ? value : `${value}+03:00`;
  const ms = Date.parse(zoned);
  return Number.isFinite(ms) ? moscowDay(ms) : null;
}

export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

const finite = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function decodeBuild(code: string): number[] | null {
  try {
    return decode(code).cards.map(([dbf]) => dbf);
  } catch {
    return null;
  }
}

/** The day's snapshot of a catalog: its day is the day of its data, not of the read. */
export function snapshotFromCatalog(catalog: PatchArchetypeCatalog, now: number): PatchArchetypeSnapshot {
  const fetched = Date.parse(catalog.updatedAt ?? '');
  const recordedAt = new Date(Number.isFinite(fetched) ? fetched : now).toISOString();
  return {
    format: catalog.format,
    day: moscowDay(Date.parse(recordedAt)),
    recordedAt,
    period: catalog.period ?? null,
    items: catalog.items.map(item => ({
      slug: item.slug,
      name: item.archetypeLabel,
      classKey: item.classKey ?? null,
      popularity: finite(item.popularity),
      winrate: finite(item.winrate),
      games: finite(item.games),
      builds: item.builds.flatMap(build => (build.deckCode ? [decodeBuild(build.deckCode)] : [])).filter((dbfs): dbfs is number[] => dbfs !== null),
    })),
  };
}

function parseSnapshot(payload: unknown): PatchArchetypeSnapshot | null {
  try {
    const value = JSON.parse(String(payload)) as PatchArchetypeSnapshot;
    return value && FORMATS.has(value.format) && DAY.test(value.day) && Array.isArray(value.items) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Keeps today's archetype catalogs as the day's snapshots. Called on every
 * patch refresh and by the hourly job of `createPatchNotesApi`, so the day before a future
 * patch is on record even when nobody opens the page. Never rejects.
 */
export function createPatchArchetypeRecorder(dependencies: {
  loadArchetypeCatalog?: (format: PatchNotesFormat) => Promise<PatchArchetypeCatalog>;
  archetypeSnapshots?: PatchArchetypeSnapshotStorage;
  now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  const formats: PatchNotesFormat[] = ['standard', 'wild'];
  return async (): Promise<void> => {
    const { loadArchetypeCatalog: load, archetypeSnapshots: store } = dependencies;
    if (!load || !store) return;
    await Promise.all(formats.map(async format => {
      try {
        store.record(snapshotFromCatalog(await load(format), now()));
      } catch {
        // A failed catalog or write leaves that format without today's snapshot; the next run retries.
      }
    }));
  };
}

/**
 * Snapshots in `<stateDirectory>/patch-archetype-snapshots-v1/snapshots.sqlite`.
 * Daily rows are replaced during their day and kept `retentionDays`, long
 * enough to pin a patch the archive lists late; pinned rows are never pruned.
 */
export class PatchArchetypeSnapshotStore implements PatchArchetypeSnapshotStorage {
  private readonly database: DatabaseSync;
  private readonly now: () => number;
  private readonly retentionMs: number;

  constructor(options: { stateDirectory: string; now?: () => number; retentionDays?: number }) {
    this.now = options.now ?? Date.now;
    this.retentionMs = Math.max(7, options.retentionDays ?? 45) * DAY_MS;
    const directory = join(options.stateDirectory, 'patch-archetype-snapshots-v1');
    mkdirSync(directory, { recursive: true });
    this.database = new DatabaseSync(join(directory, 'snapshots.sqlite'));
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS daily_snapshots (
        format TEXT NOT NULL CHECK (format IN ('standard', 'wild')),
        day TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (format, day)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS patch_snapshots (
        version TEXT NOT NULL,
        format TEXT NOT NULL CHECK (format IN ('standard', 'wild')),
        day TEXT NOT NULL,
        pinned_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (version, format)
      ) WITHOUT ROWID;
    `);
  }

  record(snapshot: PatchArchetypeSnapshot): void {
    if (!FORMATS.has(snapshot.format) || !DAY.test(snapshot.day) || !snapshot.items.length) return;
    // A later read of the same day wins; an older copy (a stale cache) never replaces it.
    this.database.prepare(`
      INSERT INTO daily_snapshots (format, day, recorded_at, payload) VALUES (?, ?, ?, ?)
      ON CONFLICT (format, day) DO UPDATE SET recorded_at = excluded.recorded_at, payload = excluded.payload
      WHERE excluded.recorded_at >= daily_snapshots.recorded_at
    `).run(snapshot.format, snapshot.day, snapshot.recordedAt, JSON.stringify(snapshot));
    this.database.prepare('DELETE FROM daily_snapshots WHERE day < ?').run(moscowDay(this.now() - this.retentionMs));
  }

  pin(version: string, day: string): void {
    if (!version || !DAY.test(day)) return;
    this.database.prepare(`
      INSERT OR IGNORE INTO patch_snapshots (version, format, day, pinned_at, payload)
      SELECT ?, format, day, ?, payload FROM daily_snapshots WHERE day = ?
    `).run(version, new Date(this.now()).toISOString(), day);
  }

  pinned(version: string): PatchArchetypeSnapshot[] {
    const rows = this.database.prepare('SELECT payload FROM patch_snapshots WHERE version = ? ORDER BY format')
      .all(version) as { payload: string }[];
    return rows.flatMap(row => parseSnapshot(row.payload) ?? []);
  }

  close(): void {
    this.database.close();
  }
}
