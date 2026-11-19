import type { DatabaseSync } from 'node:sqlite';
import type { FunDeckRow } from './funDeckRows.js';

export type FunDeckModerationAction = 'hide' | 'pin';

export type FunDeckModerationRecord = {
  /** Lower-case: `standard` or `wild`. */
  format: string;
  deckCode: string;
  action: FunDeckModerationAction;
  /** The deck as the admin saw it: a pinned deck the dataset dropped, and the list of hidden ones, show from it. */
  snapshot: FunDeckRow | null;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

type StoredRow = {
  format: string;
  deck_code: string;
  action: string;
  snapshot_json: string | null;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
};

export function ensureFunDeckModerationSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fun_deck_moderation (
      format TEXT NOT NULL,
      deck_code TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('hide', 'pin')),
      snapshot_json TEXT,
      note TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (format, deck_code)
    )
  `);
}

function parseSnapshot(json: string | null): FunDeckRow | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as FunDeckRow : null;
  } catch {
    return null;
  }
}

function fromRow(row: StoredRow): FunDeckModerationRecord {
  return {
    format: row.format,
    deckCode: row.deck_code,
    action: row.action === 'pin' ? 'pin' : 'hide',
    snapshot: parseSnapshot(row.snapshot_json),
    note: row.note,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export function listFunDeckModeration(database: DatabaseSync): FunDeckModerationRecord[] {
  ensureFunDeckModerationSchema(database);
  const rows = database.prepare('SELECT * FROM fun_deck_moderation ORDER BY updated_at DESC, deck_code').all() as StoredRow[];
  return rows.map(fromRow);
}

export function findFunDeckModeration(database: DatabaseSync, format: string, deckCode: string): FunDeckModerationRecord | null {
  ensureFunDeckModerationSchema(database);
  const row = database.prepare('SELECT * FROM fun_deck_moderation WHERE format = ? AND deck_code = ?')
    .get(format, deckCode) as StoredRow | undefined;
  return row ? fromRow(row) : null;
}

/** A second decision on the same deck replaces the first. */
export function saveFunDeckModeration(database: DatabaseSync, record: FunDeckModerationRecord): void {
  ensureFunDeckModerationSchema(database);
  database.prepare(`
    INSERT INTO fun_deck_moderation (format, deck_code, action, snapshot_json, note, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(format, deck_code) DO UPDATE SET
      action = excluded.action, snapshot_json = excluded.snapshot_json, note = excluded.note,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(record.format, record.deckCode, record.action, record.snapshot ? JSON.stringify(record.snapshot) : null,
    record.note, record.updatedBy, record.updatedAt);
}

/** Returns whether a decision was removed; clearing a deck with none is not an error. */
export function clearFunDeckModeration(database: DatabaseSync, format: string, deckCode: string): boolean {
  ensureFunDeckModerationSchema(database);
  return Number(database.prepare('DELETE FROM fun_deck_moderation WHERE format = ? AND deck_code = ?')
    .run(format, deckCode).changes) > 0;
}

const formatKey = (deck: Pick<FunDeckRow, 'format'>) => deck.format.toLowerCase();
const keyOf = (format: string, deckCode: string) => `${format}\u0000${deckCode}`;

/**
 * The selection with the admin's decisions applied. Pinned decks go first in
 * their format (the rest keep their order); a pinned deck the dataset no
 * longer has comes from its snapshot. `forAdmin` keeps hidden decks and
 * marks each deck with its decision instead of the public `pinned` flag.
 */
export function applyFunDeckModeration(
  decks: readonly FunDeckRow[],
  records: readonly FunDeckModerationRecord[],
  forAdmin = false,
): FunDeckRow[] {
  const byKey = new Map(records.map(record => [keyOf(record.format, record.deckCode), record]));
  const present = new Set(decks.map(deck => keyOf(formatKey(deck), deck.deckCode)));
  const fromSnapshots = records
    .filter(record => record.action === 'pin' && record.snapshot && !present.has(keyOf(record.format, record.deckCode)))
    .map(record => record.snapshot as FunDeckRow);
  const marked = [...decks, ...fromSnapshots].flatMap((deck): FunDeckRow[] => {
    const action = byKey.get(keyOf(formatKey(deck), deck.deckCode))?.action ?? null;
    if (forAdmin) return [{ ...deck, moderation: action }];
    if (action === 'hide') return [];
    return [action === 'pin' ? { ...deck, pinned: true } : deck];
  });
  // Array.prototype.sort is stable: only the pinned-first rule and the format grouping change anything.
  return marked.sort((left, right) => (
    formatKey(left).localeCompare(formatKey(right), 'ru')
    || Number(right.moderation === 'pin' || right.pinned === true) - Number(left.moderation === 'pin' || left.pinned === true)
  ));
}
