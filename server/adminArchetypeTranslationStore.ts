import type { DatabaseSync } from 'node:sqlite';
import { findDuplicateArchetypeLabels } from './modules/constructedArchetypes/public.js';

export function insertManualTranslation(
  database: DatabaseSync,
  translation: { nameEn: string; nameRu: string; nameKey: string; nameRuKey: string },
  actorId: string,
  timestamp: string,
): Record<string, unknown> {
  const result = database.prepare(`
    INSERT INTO archetype_translations (
      blizzcore_id, name_en, name_en_key, name_ru, name_ru_key, source, created_at, updated_at, synced_at, updated_by
    ) VALUES (NULL, ?, ?, ?, ?, 'manual', ?, ?, NULL, ?)
  `).run(translation.nameEn, translation.nameKey, translation.nameRu, translation.nameRuKey, timestamp, timestamp, actorId);
  return database.prepare('SELECT * FROM archetype_translations WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
}

/** English name of another archetype that already uses this Russian label, if any. */
export function russianLabelOwner(database: DatabaseSync, nameRuKey: string, nameKey: string, ownId = 0): string | null {
  const row = database.prepare(`
    SELECT name_en FROM archetype_translations WHERE name_ru_key = ? AND name_en_key <> ? AND id <> ? LIMIT 1
  `).get(nameRuKey, nameKey, ownId) as { name_en?: string } | undefined;
  return row?.name_en ? String(row.name_en) : null;
}

export function duplicateLabelError(owner: string): { error: string } {
  return { error: `Это русское название уже у архетипа «${owner}». Уточните перевод, чтобы архетипы различались.` };
}

/** Every translation as a lookup map, keyed by the stored English key. */
export function loadTranslationMap(database: DatabaseSync): Record<string, string> {
  const rows = database.prepare('SELECT name_en_key, name_ru FROM archetype_translations').all() as Array<{ name_en_key: string; name_ru: string }>;
  return Object.fromEntries(rows.map(row => [String(row.name_en_key || ''), String(row.name_ru || '')]));
}

export function listDuplicateLabels(database: DatabaseSync) {
  const rows = database.prepare('SELECT name_en, name_ru FROM archetype_translations').all() as Array<{ name_en: string; name_ru: string }>;
  return findDuplicateArchetypeLabels(rows.map(row => ({ nameEn: String(row.name_en || ''), nameRu: String(row.name_ru || '') })));
}
