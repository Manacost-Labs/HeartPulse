import type { DatabaseSync } from 'node:sqlite';

const BATCH_SIZE = 500;

/**
 * Removes only disposable expired identity state. Consumed artifacts and grant
 * revocation tombstones deliberately remain as replay and resurrection evidence.
 */
export function cleanupIdentityStorage(database: DatabaseSync, now = Date.now()): { models: number; bindings: number } {
  const modelCutoffSeconds = Math.floor(now / 1_000);
  const models = database.prepare(`DELETE FROM browser_identity_models WHERE rowid IN (
    SELECT rowid FROM browser_identity_models
    WHERE expires_at IS NOT NULL AND expires_at <= ? AND consumed IS NULL
    ORDER BY expires_at ASC LIMIT ${BATCH_SIZE}
  )`).run(modelCutoffSeconds).changes;
  const bindings = database.prepare(`DELETE FROM browser_identity_session_bindings WHERE rowid IN (
    SELECT rowid FROM browser_identity_session_bindings
    WHERE expires_at <= ? ORDER BY expires_at ASC LIMIT ${BATCH_SIZE}
  )`).run(now).changes;
  return { models: Number(models), bindings: Number(bindings) };
}
