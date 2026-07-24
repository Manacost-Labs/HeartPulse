import { Router, type Request, type RequestHandler, type Response } from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;
const MAX_UPSTREAM_ROWS = 1_000;
const MAX_NAME_LENGTH = 180;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

type AdminIdentity = { id: string };
type TranslationSource = 'blizzcore' | 'manual';

export type ArchetypeTranslation = {
  id: number;
  blizzcoreId: number | null;
  nameEn: string;
  nameRu: string;
  source: TranslationSource;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  updatedBy: string | null;
};

export type BlizzcoreArchetype = {
  id: number;
  nameEn: string;
  nameRu: string;
};

export type ObservedArchetype = {
  nameEn: string;
  rank: string;
  deckCode?: string | null;
  format?: 'standard' | 'wild';
  rankKey?: 'all' | 'diamond_all' | 'diamond' | 'diamond_legend' | 'legend'
    | 'top_5k' | 'top_500' | 'top_100' | 'top_legend';
};

export type UntranslatedArchetype = { nameEn: string; ranks: string[]; deckCode?: string };

export type ArchetypeTranslationCoverage = {
  items: UntranslatedArchetype[];
  totalObserved: number;
  translated: number;
  missing: number;
  coveragePercent: number;
};

export type AdminArchetypeTranslationRouterDependencies = {
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => AdminIdentity | null;
  getDatabase: () => DatabaseSync;
  loadUpstream: () => Promise<unknown>;
  loadObservedArchetypes?: () => Promise<ObservedArchetype[]>;
  resolveMissingDeckCodes?: (
    items: UntranslatedArchetype[],
    observed: ObservedArchetype[],
  ) => Promise<UntranslatedArchetype[]>;
  ensureSeeded?: () => Promise<void>;
  setPrivateNoStore: (response: Response) => void;
  invalidateTranslations: () => void;
  recordAudit?: (actor: AdminIdentity, action: string, entityId: string, details?: Record<string, unknown>) => void;
  now?: () => Date;
};

export class ArchetypeTranslationValidationError extends Error {}

function normalizeText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new ArchetypeTranslationValidationError(`${label} должно быть строкой`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new ArchetypeTranslationValidationError(`${label} обязательно`);
  if (normalized.length > MAX_NAME_LENGTH) {
    throw new ArchetypeTranslationValidationError(`${label} не может быть длиннее ${MAX_NAME_LENGTH} символов`);
  }
  if (CONTROL_CHARACTERS.test(normalized)) throw new ArchetypeTranslationValidationError(`${label} содержит недопустимые символы`);
  return normalized;
}

export function normalizeArchetypeTranslation(value: unknown): { nameEn: string; nameRu: string; nameKey: string; nameRuKey: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ArchetypeTranslationValidationError('translation должна быть объектом');
  }
  const record = value as Record<string, unknown>;
  const nameEn = normalizeText(record.nameEn ?? record.name_en, 'Английское название');
  if (!/[a-z]/i.test(nameEn)) throw new ArchetypeTranslationValidationError('Английское название должно содержать латинские буквы');
  const nameRu = normalizeText(record.nameRu ?? record.name_ru, 'Русский перевод');
  return {
    nameEn,
    nameRu,
    nameKey: nameEn.toLocaleLowerCase('en-US'),
    nameRuKey: nameRu.toLocaleLowerCase('ru-RU'),
  };
}

export function normalizeBlizzcoreArchetypes(payload: unknown): BlizzcoreArchetype[] {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).items)
      ? (payload as { items: unknown[] }).items
      : null;
  if (!source) throw new ArchetypeTranslationValidationError('BlizzCore вернул неожиданный формат данных');
  if (source.length > MAX_UPSTREAM_ROWS) throw new ArchetypeTranslationValidationError('BlizzCore вернул слишком много строк');

  const ids = new Set<number>();
  const keys = new Set<string>();
  return source.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ArchetypeTranslationValidationError('BlizzCore вернул некорректную строку');
    }
    const record = item as Record<string, unknown>;
    // BlizzCore has a small number of legacy rows whose name_en is already in
    // Russian. Keep those source rows importable while preserving the stricter
    // Latin-name validation for translations entered manually in the admin UI.
    const nameEn = normalizeText(record.nameEn ?? record.name_en, 'Английское название');
    const nameRu = normalizeText(record.nameRu ?? record.name_ru, 'Русский перевод');
    const nameKey = nameEn.toLocaleLowerCase('en-US');
    const rawId = Number((item as Record<string, unknown>).id);
    if (!Number.isSafeInteger(rawId) || rawId <= 0) throw new ArchetypeTranslationValidationError('BlizzCore вернул некорректный id');
    if (ids.has(rawId) || keys.has(nameKey)) throw new ArchetypeTranslationValidationError('BlizzCore вернул дублирующиеся строки');
    ids.add(rawId);
    keys.add(nameKey);
    return { id: rawId, nameEn, nameRu };
  });
}

function fromRow(row: Record<string, unknown>): ArchetypeTranslation {
  return {
    id: Number(row.id),
    blizzcoreId: row.blizzcore_id === null || row.blizzcore_id === undefined ? null : Number(row.blizzcore_id),
    nameEn: String(row.name_en || ''),
    nameRu: String(row.name_ru || ''),
    source: row.source === 'manual' ? 'manual' : 'blizzcore',
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    syncedAt: row.synced_at ? String(row.synced_at) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
  };
}

export function syncBlizzcoreArchetypes(
  database: DatabaseSync,
  rows: BlizzcoreArchetype[],
  actorId: string,
  timestamp: string,
): { imported: number; updated: number; preservedManual: number } {
  let imported = 0;
  let updated = 0;
  let preservedManual = 0;
  const byUpstreamId = database.prepare('SELECT * FROM archetype_translations WHERE blizzcore_id = ?');
  const byKey = database.prepare('SELECT * FROM archetype_translations WHERE name_en_key = ?');
  const insert = database.prepare(`
    INSERT INTO archetype_translations (
      blizzcore_id, name_en, name_en_key, name_ru, name_ru_key, source, created_at, updated_at, synced_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, 'blizzcore', ?, ?, ?, ?)
  `);
  const updateRemote = database.prepare(`
    UPDATE archetype_translations
    SET blizzcore_id = ?, name_en = ?, name_en_key = ?, name_ru = ?, name_ru_key = ?, updated_at = ?, synced_at = ?, updated_by = ?
    WHERE id = ?
  `);
  const markManualSynced = database.prepare(`
    UPDATE archetype_translations SET blizzcore_id = COALESCE(blizzcore_id, ?), synced_at = ? WHERE id = ?
  `);

  database.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rows) {
      const nameKey = row.nameEn.toLocaleLowerCase('en-US');
      const nameRuKey = row.nameRu.toLocaleLowerCase('ru-RU');
      const existing = (byUpstreamId.get(row.id) || byKey.get(nameKey)) as Record<string, unknown> | undefined;
      if (!existing) {
        insert.run(row.id, row.nameEn, nameKey, row.nameRu, nameRuKey, timestamp, timestamp, timestamp, actorId);
        imported += 1;
      } else if (existing.source === 'manual') {
        markManualSynced.run(row.id, timestamp, Number(existing.id));
        preservedManual += 1;
      } else {
        updateRemote.run(row.id, row.nameEn, nameKey, row.nameRu, nameRuKey, timestamp, timestamp, actorId, Number(existing.id));
        updated += 1;
      }
    }
    database.exec('COMMIT');
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* transaction did not start */ }
    throw error;
  }
  return { imported, updated, preservedManual };
}

export function analyzeArchetypeTranslationCoverage(
  database: DatabaseSync,
  observed: ObservedArchetype[],
): ArchetypeTranslationCoverage {
  const translationKeys = (database.prepare('SELECT name_en_key FROM archetype_translations').all() as Array<{ name_en_key: string }>)
    .map(row => String(row.name_en_key || '').trim())
    .filter(Boolean);
  const grouped = new Map<string, { nameEn: string; ranks: Set<string>; deckCode: string | null }>();
  for (const item of observed) {
    const nameEn = String(item?.nameEn || '').trim().replace(/\s+/g, ' ');
    const rank = String(item?.rank || '').trim();
    if (!nameEn || nameEn.length > MAX_NAME_LENGTH || CONTROL_CHARACTERS.test(nameEn)) continue;
    const key = nameEn.toLocaleLowerCase('en-US');
    const current = grouped.get(key) ?? { nameEn, ranks: new Set<string>(), deckCode: null };
    if (rank) current.ranks.add(rank);
    const deckCode = String(item?.deckCode || '').trim();
    if (!current.deckCode && /^[A-Za-z0-9+/=]{40,}$/.test(deckCode)) current.deckCode = deckCode;
    grouped.set(key, current);
  }

  const missing = [...grouped.entries()]
    .filter(([key]) => !translationKeys.some(translationKey => key === translationKey || key.includes(translationKey)))
    .map(([, item]) => ({
      nameEn: item.nameEn,
      ranks: [...item.ranks].sort((left, right) => left.localeCompare(right, 'ru')),
      ...(item.deckCode ? { deckCode: item.deckCode } : {}),
    }))
    .sort((left, right) => left.nameEn.localeCompare(right.nameEn, 'en'));
  const totalObserved = grouped.size;
  const translated = totalObserved - missing.length;
  return {
    items: missing,
    totalObserved,
    translated,
    missing: missing.length,
    coveragePercent: totalObserved ? Math.round((translated / totalObserved) * 1_000) / 10 : 100,
  };
}

function listTranslations(database: DatabaseSync, request: Request) {
  const query = String(request.query.q || '').trim().slice(0, MAX_NAME_LENGTH).toLocaleLowerCase('ru-RU');
  const source = request.query.source === 'manual' || request.query.source === 'blizzcore'
    ? String(request.query.source)
    : '';
  const page = Math.max(1, Math.floor(Number(request.query.page) || 1));
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(Number(request.query.pageSize) || DEFAULT_PAGE_SIZE)));
  const where: string[] = [];
  const values: Array<string | number> = [];
  if (query) {
    where.push('(name_en_key LIKE ? ESCAPE \'\\\' OR name_ru_key LIKE ? ESCAPE \'\\\')');
    const escaped = query.replace(/[\\%_]/g, character => `\\${character}`);
    values.push(`%${escaped}%`, `%${escaped}%`);
  }
  if (source) {
    where.push('source = ?');
    values.push(source);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((database.prepare(`SELECT COUNT(*) AS total FROM archetype_translations ${whereSql}`).get(...values) as any)?.total || 0);
  const items = database.prepare(`
    SELECT * FROM archetype_translations ${whereSql}
    ORDER BY name_en COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).all(...values, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
  const stats = database.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN source = 'manual' THEN 1 ELSE 0 END) AS manual,
      SUM(CASE WHEN source = 'blizzcore' THEN 1 ELSE 0 END) AS blizzcore,
      MAX(synced_at) AS last_synced_at
    FROM archetype_translations
  `).get() as Record<string, unknown>;
  return {
    items: items.map(fromRow),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    stats: {
      total: Number(stats.total || 0),
      manual: Number(stats.manual || 0),
      blizzcore: Number(stats.blizzcore || 0),
      lastSyncedAt: stats.last_synced_at ? String(stats.last_synced_at) : null,
    },
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return String(error instanceof Error ? error.message : error).includes('UNIQUE constraint failed');
}

export function createAdminArchetypeTranslationRouter(
  dependencies: AdminArchetypeTranslationRouterDependencies,
): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    return dependencies.adminAuth(request);
  };

  router.get('/admin/archetype-translations', dependencies.adminGuard, async (request, response) => {
    if (!authorize(request, response)) return response.status(401).json({ error: 'Требуется вход' });
    try {
      await dependencies.ensureSeeded?.();
      return response.json(listTranslations(dependencies.getDatabase(), request));
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить переводы архетипов' });
    }
  });

  router.get('/admin/archetype-translations/untranslated', dependencies.adminGuard, async (request, response) => {
    if (!authorize(request, response)) return response.status(401).json({ error: 'Требуется вход' });
    if (!dependencies.loadObservedArchetypes) {
      return response.status(503).json({ error: 'Проверка покрытия переводов не настроена' });
    }
    try {
      await dependencies.ensureSeeded?.();
      const observed = await dependencies.loadObservedArchetypes();
      const coverage = analyzeArchetypeTranslationCoverage(dependencies.getDatabase(), observed);
      if (dependencies.resolveMissingDeckCodes && coverage.items.some(item => !item.deckCode)) {
        coverage.items = await dependencies.resolveMissingDeckCodes(coverage.items, observed);
      }
      return response.json(coverage);
    } catch {
      return response.status(502).json({ error: 'Не удалось проверить актуальные архетипы' });
    }
  });

  router.post('/admin/archetype-translations', dependencies.adminGuard, (request, response) => {
    const actor = authorize(request, response);
    if (!actor) return response.status(401).json({ error: 'Требуется вход' });
    let translation: ReturnType<typeof normalizeArchetypeTranslation>;
    try {
      translation = normalizeArchetypeTranslation(request.body?.translation ?? request.body);
    } catch (error) {
      return response.status(400).json({ error: error instanceof Error ? error.message : 'Некорректный перевод' });
    }
    const timestamp = now().toISOString();
    try {
      const result = dependencies.getDatabase().prepare(`
        INSERT INTO archetype_translations (
          blizzcore_id, name_en, name_en_key, name_ru, name_ru_key, source, created_at, updated_at, synced_at, updated_by
        ) VALUES (NULL, ?, ?, ?, ?, 'manual', ?, ?, NULL, ?)
      `).run(translation.nameEn, translation.nameKey, translation.nameRu, translation.nameRuKey, timestamp, timestamp, actor.id);
      const row = dependencies.getDatabase().prepare('SELECT * FROM archetype_translations WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
      dependencies.invalidateTranslations();
      dependencies.recordAudit?.(actor, 'archetype-translation.created', String(result.lastInsertRowid), {
        nameEn: translation.nameEn,
      });
      return response.status(201).json({ success: true, translation: fromRow(row) });
    } catch (error) {
      if (isUniqueConstraint(error)) return response.status(409).json({ error: 'Перевод для этого архетипа уже существует' });
      return response.status(500).json({ error: 'Не удалось добавить перевод' });
    }
  });

  router.patch('/admin/archetype-translations/:id', dependencies.adminGuard, (request, response) => {
    const actor = authorize(request, response);
    if (!actor) return response.status(401).json({ error: 'Требуется вход' });
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return response.status(400).json({ error: 'Некорректный id' });
    let translation: ReturnType<typeof normalizeArchetypeTranslation>;
    try {
      translation = normalizeArchetypeTranslation(request.body?.translation ?? request.body);
    } catch (error) {
      return response.status(400).json({ error: error instanceof Error ? error.message : 'Некорректный перевод' });
    }
    const database = dependencies.getDatabase();
    const previous = database.prepare('SELECT * FROM archetype_translations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!previous) return response.status(404).json({ error: 'Перевод не найден' });
    try {
      database.prepare(`
        UPDATE archetype_translations
        SET name_en = ?, name_en_key = ?, name_ru = ?, name_ru_key = ?, source = 'manual', updated_at = ?, updated_by = ?
        WHERE id = ?
      `).run(translation.nameEn, translation.nameKey, translation.nameRu, translation.nameRuKey, now().toISOString(), actor.id, id);
      const row = database.prepare('SELECT * FROM archetype_translations WHERE id = ?').get(id) as Record<string, unknown>;
      dependencies.invalidateTranslations();
      dependencies.recordAudit?.(actor, 'archetype-translation.updated', String(id), {
        nameEn: translation.nameEn,
        previousNameEn: String(previous.name_en || ''),
      });
      return response.json({ success: true, translation: fromRow(row) });
    } catch (error) {
      if (isUniqueConstraint(error)) return response.status(409).json({ error: 'Перевод для этого архетипа уже существует' });
      return response.status(500).json({ error: 'Не удалось обновить перевод' });
    }
  });

  router.post('/admin/archetype-translations/sync', dependencies.adminGuard, async (request, response) => {
    const actor = authorize(request, response);
    if (!actor) return response.status(401).json({ error: 'Требуется вход' });
    let rows: BlizzcoreArchetype[];
    try {
      rows = normalizeBlizzcoreArchetypes(await dependencies.loadUpstream());
    } catch {
      return response.status(502).json({ error: 'Не удалось получить корректную таблицу переводов из BlizzCore' });
    }
    const timestamp = now().toISOString();
    try {
      const result = syncBlizzcoreArchetypes(dependencies.getDatabase(), rows, actor.id, timestamp);
      dependencies.invalidateTranslations();
      dependencies.recordAudit?.(actor, 'archetype-translation.synced', 'blizzcore', { rows: rows.length, ...result });
      return response.json({ success: true, rows: rows.length, ...result, syncedAt: timestamp });
    } catch {
      return response.status(500).json({ error: 'Не удалось сохранить таблицу переводов' });
    }
  });

  return router;
}
