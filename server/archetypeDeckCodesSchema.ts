// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';

const TABLE_NAME = 'archetype_deck_codes';
const LEGACY_TABLE_NAME = 'archetype_deck_codes_before_all_rank';

export const ARCHETYPE_DECK_CODES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS archetype_deck_codes (
    name_en_key TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    deck_code TEXT NOT NULL,
    format TEXT NOT NULL CHECK(format IN ('standard', 'wild')),
    rank_key TEXT NOT NULL CHECK(rank_key IN ('legend', 'diamond', 'top_5k', 'top_legend', 'all')),
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

export function ensureArchetypeDeckCodesAllRank(database: DatabaseSync): boolean {
  const row = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(TABLE_NAME) as { sql?: string } | undefined;
  if (!row?.sql) {
    database.exec(ARCHETYPE_DECK_CODES_TABLE_SQL);
    return true;
  }
  if (/rank_key\s+TEXT[\s\S]*?'all'/i.test(row.sql)) return false;

  try {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE ${TABLE_NAME} RENAME TO ${LEGACY_TABLE_NAME};
      ${ARCHETYPE_DECK_CODES_TABLE_SQL};
      INSERT INTO ${TABLE_NAME} (
        name_en_key, name_en, deck_code, format, rank_key, source, updated_at
      )
      SELECT name_en_key, name_en, deck_code, format, rank_key, source, updated_at
      FROM ${LEGACY_TABLE_NAME};
      DROP TABLE ${LEGACY_TABLE_NAME};
      CREATE INDEX IF NOT EXISTS idx_archetype_deck_codes_updated
      ON ${TABLE_NAME}(updated_at DESC);
      COMMIT;
    `);
  } catch (error) {
    try {
      database.exec('ROLLBACK;');
    } catch {
      // SQLite may already have rolled back a failed transaction.
    }
    throw error;
  }
  return true;
}
