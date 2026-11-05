import type { DatabaseSync } from 'node:sqlite';
import type { SavedDeckFormat, SavedDeckRecord, SavedDeckStatus } from './model.js';

// One row per deck of an account; deleting the account deletes its decks.
// A deck code is saved once per account.
export const SAVED_DECK_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS saved_decks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    deck_code TEXT NOT NULL,
    deck_name TEXT NOT NULL,
    render_name TEXT NOT NULL,
    format TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    image_url TEXT,
    preview_image_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, deck_code),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_saved_decks_user_created ON saved_decks(user_id, created_at DESC);
`;

type Row = Record<string, unknown>;

function recordFromRow(row: Row): SavedDeckRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    deckCode: String(row.deck_code),
    deckName: String(row.deck_name),
    renderName: String(row.render_name ?? 'Колода'),
    format: row.format === 'wild' ? 'wild' : 'standard',
    comment: String(row.comment ?? ''),
    status: (['pending', 'ready', 'failed'].includes(String(row.status)) ? row.status : 'failed') as SavedDeckStatus,
    imageUrl: row.image_url ? String(row.image_url) : null,
    previewImageUrl: row.preview_image_url ? String(row.preview_image_url) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type SavedDeckRepository = ReturnType<typeof createSavedDeckRepository>;

export function createSavedDeckRepository(getDatabase: () => DatabaseSync) {
  getDatabase().exec(SAVED_DECK_TABLES_SQL);
  return {
    /** Newest first. */
    list(userId: string): SavedDeckRecord[] {
      return (getDatabase().prepare('SELECT * FROM saved_decks WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
        .all(userId) as Row[]).map(recordFromRow);
    },
    find(userId: string, id: string): SavedDeckRecord | null {
      const row = getDatabase().prepare('SELECT * FROM saved_decks WHERE user_id = ? AND id = ?').get(userId, id) as Row | undefined;
      return row ? recordFromRow(row) : null;
    },
    count(userId: string): number {
      return Number((getDatabase().prepare('SELECT COUNT(*) AS count FROM saved_decks WHERE user_id = ?').get(userId) as Row).count);
    },
    hasCode(userId: string, deckCode: string): boolean {
      return Boolean(getDatabase().prepare('SELECT 1 FROM saved_decks WHERE user_id = ? AND deck_code = ?').get(userId, deckCode));
    },
    insert(record: SavedDeckRecord): void {
      getDatabase().prepare(`INSERT INTO saved_decks
        (id, user_id, deck_code, deck_name, render_name, format, comment, status, image_url, preview_image_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(record.id, record.userId, record.deckCode, record.deckName, record.renderName,
        record.format as SavedDeckFormat, record.comment, record.status, record.imageUrl, record.previewImageUrl,
        record.createdAt, record.updatedAt);
    },
    setRender(id: string, render: { status: SavedDeckStatus; imageUrl?: string | null; previewImageUrl?: string | null }, at: string): void {
      getDatabase().prepare(`UPDATE saved_decks SET status = ?, image_url = COALESCE(?, image_url),
        preview_image_url = COALESCE(?, preview_image_url), updated_at = ? WHERE id = ?`)
        .run(render.status, render.imageUrl ?? null, render.previewImageUrl ?? null, at, id);
    },
    setComment(userId: string, id: string, comment: string): boolean {
      const result = getDatabase().prepare('UPDATE saved_decks SET comment = ? WHERE user_id = ? AND id = ?')
        .run(comment, userId, id) as { changes?: number | bigint };
      return Number(result.changes ?? 0) > 0;
    },
    remove(userId: string, id: string): boolean {
      const result = getDatabase().prepare('DELETE FROM saved_decks WHERE user_id = ? AND id = ?').run(userId, id) as { changes?: number | bigint };
      return Number(result.changes ?? 0) > 0;
    },
  };
}
