import { Router, type Request, type RequestHandler, type Response } from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';
import type { ConstructedCardCollection } from './constructedCardRoutes.js';

type AdminIdentity = { id: string };
type CardFormat = 'standard' | 'wild';
type JsonRecord = Record<string, any>;

export const DEFAULT_CONSTRUCTED_MECHANIC_TRANSLATIONS: Record<string, string> = {
  BATTLECRY: 'Боевой клич', DEATHRATTLE: 'Предсмертный хрип', TAUNT: 'Провокация', DIVINE_SHIELD: 'Божественный щит',
  RUSH: 'Натиск', CHARGE: 'Рывок', LIFESTEAL: 'Похищение жизни', POISONOUS: 'Яд', REBORN: 'Перерождение',
  DISCOVER: 'Раскопка', SECRET: 'Секрет', COMBO: 'Серия приёмов', OVERLOAD: 'Перегрузка', WINDFURY: 'Неистовство ветра',
  STEALTH: 'Маскировка', FREEZE: 'Заморозка', TRADEABLE: 'Обмен', TITAN: 'Титан', COLOSSAL: 'Колосс',
  FORGE: 'Ковка', FINALE: 'Финал', OUTCAST: 'Изгой', SPELLBURST: 'Чары', HONORABLE_KILL: 'Достойная победа',
};

export type AdminMechanicTranslationRouterDependencies = {
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => AdminIdentity | null;
  getDatabase: () => DatabaseSync;
  loadCards: (format: CardFormat) => Promise<ConstructedCardCollection>;
  setPrivateNoStore: (response: Response) => void;
  recordAudit?: (actor: AdminIdentity, action: string, entityId: string, details?: Record<string, unknown>) => void;
  now?: () => Date;
};

const MAX_TRANSLATION_LENGTH = 120;
const MAX_PAGE_SIZE = 100;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function mechanicKey(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
}

export function mechanicEnglishLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === raw.toLocaleUpperCase('en-US')) {
    return raw.toLocaleLowerCase('en-US').replace(/_/g, ' ').replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('en-US'));
  }
  return raw.replace(/_/g, ' ');
}

export function loadConstructedMechanicTranslationMap(database: DatabaseSync): Record<string, string> {
  const rows = database.prepare('SELECT mechanic_key, name_ru FROM mechanic_translations').all() as Array<{ mechanic_key: string; name_ru: string }>;
  return rows.reduce((translations, row) => {
    const key = mechanicKey(row.mechanic_key);
    const value = String(row.name_ru ?? '').trim();
    if (key && value) translations[key] = value;
    return translations;
  }, { ...DEFAULT_CONSTRUCTED_MECHANIC_TRANSLATIONS });
}

function preferredExample(current: JsonRecord | undefined, candidate: JsonRecord): JsonRecord {
  if (!current) return candidate;
  const currentIsMinion = String(current?.card_type?.slug ?? '').toUpperCase() === 'MINION';
  const candidateIsMinion = String(candidate?.card_type?.slug ?? '').toUpperCase() === 'MINION';
  if (!currentIsMinion && candidateIsMinion) return candidate;
  if (!current?.images?.card && candidate?.images?.card) return candidate;
  return current;
}

function readTranslation(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Русский перевод должен быть строкой');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('Введите перевод на русском');
  if (normalized.length > MAX_TRANSLATION_LENGTH) throw new Error(`Перевод не может быть длиннее ${MAX_TRANSLATION_LENGTH} символов`);
  if (CONTROL_CHARACTERS.test(normalized)) throw new Error('Перевод содержит недопустимые символы');
  return normalized;
}

export function createAdminMechanicTranslationRouter(dependencies: AdminMechanicTranslationRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    return dependencies.adminAuth(request);
  };

  router.get('/admin/mechanic-translations', dependencies.adminGuard, async (request, response) => {
    if (!authorize(request, response)) return response.status(401).json({ error: 'Требуется вход' });
    try {
      const collection = await dependencies.loadCards('wild');
      const database = dependencies.getDatabase();
      const savedRows = database.prepare('SELECT mechanic_key, name_en, name_ru, updated_at FROM mechanic_translations').all() as Array<Record<string, unknown>>;
      const saved = new Map(savedRows.map(row => [mechanicKey(row.mechanic_key), row]));
      const examples = new Map<string, JsonRecord>();
      const counts = new Map<string, number>();
      const observedNames = new Map<string, string>();
      const observedKinds = new Map<string, Set<'mechanic' | 'tag'>>();
      for (const card of collection.cards) {
        const observed = [
          ...(Array.isArray(card?.mechanics) ? card.mechanics.map((value: unknown) => ({ value, kind: 'mechanic' as const })) : []),
          ...(Array.isArray(card?.referenced_tags) ? card.referenced_tags.map((value: unknown) => ({ value, kind: 'tag' as const })) : []),
        ];
        for (const { value: rawMechanic, kind } of observed) {
          const key = mechanicKey(rawMechanic);
          if (!key || /^\d+$/.test(key)) continue;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          observedNames.set(key, observedNames.get(key) ?? String(rawMechanic));
          const kinds = observedKinds.get(key) ?? new Set<'mechanic' | 'tag'>();
          kinds.add(kind);
          observedKinds.set(key, kinds);
          examples.set(key, preferredExample(examples.get(key), card));
        }
      }
      for (const row of savedRows) observedNames.set(mechanicKey(row.mechanic_key), String(row.name_en || row.mechanic_key));

      const allItems = [...observedNames.entries()].map(([key, rawName]) => {
        const savedRow = saved.get(key);
        const fallback = DEFAULT_CONSTRUCTED_MECHANIC_TRANSLATIONS[key] ?? '';
        const example = examples.get(key);
        const kinds = observedKinds.get(key) ?? new Set<'mechanic' | 'tag'>(['tag']);
        return {
          key,
          nameEn: String(savedRow?.name_en || mechanicEnglishLabel(rawName)),
          nameRu: String(savedRow?.name_ru || fallback),
          source: savedRow ? 'manual' : fallback ? 'default' : 'missing',
          cardCount: counts.get(key) ?? 0,
          updatedAt: savedRow?.updated_at ? String(savedRow.updated_at) : null,
          kind: kinds.size > 1 ? 'both' : kinds.has('mechanic') ? 'mechanic' : 'tag',
          example: example ? {
            cardId: String(example.card_id || ''),
            name: example.name ?? null,
            imageUrl: example.images?.card ?? null,
            type: String(example.card_type?.slug ?? ''),
          } : null,
        };
      });
      const stats = {
        total: allItems.length,
        manual: allItems.filter(item => item.source === 'manual').length,
        default: allItems.filter(item => item.source === 'default').length,
        missing: allItems.filter(item => item.source === 'missing').length,
        mechanics: allItems.filter(item => item.kind === 'mechanic' || item.kind === 'both').length,
        tags: allItems.filter(item => item.kind === 'tag' || item.kind === 'both').length,
      };
      const query = String(request.query.q ?? '').trim().toLocaleLowerCase('ru-RU').slice(0, 120);
      const status = ['manual', 'default', 'missing'].includes(String(request.query.status)) ? String(request.query.status) : '';
      const kind = ['mechanic', 'tag', 'both'].includes(String(request.query.kind)) ? String(request.query.kind) : '';
      const filtered = allItems
        .filter(item => !status || item.source === status)
        .filter(item => !kind || item.kind === kind || item.kind === 'both')
        .filter(item => !query || `${item.nameEn} ${item.nameRu} ${item.example?.name?.ru || ''}`.toLocaleLowerCase('ru-RU').includes(query))
        .sort((left, right) => {
          const priority = { missing: 0, manual: 1, default: 2 } as const;
          return priority[left.source as keyof typeof priority] - priority[right.source as keyof typeof priority]
            || left.nameEn.localeCompare(right.nameEn, 'en');
        });
      const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(Number(request.query.pageSize) || 40)));
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const page = Math.min(pages, Math.max(1, Math.floor(Number(request.query.page) || 1)));
      return response.json({
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        page,
        pageSize,
        pages,
        stats,
      });
    } catch {
      return response.status(502).json({ error: 'Не удалось загрузить механики карт' });
    }
  });

  router.put('/admin/mechanic-translations/:key', dependencies.adminGuard, (request, response) => {
    const actor = authorize(request, response);
    if (!actor) return response.status(401).json({ error: 'Требуется вход' });
    const key = mechanicKey(request.params.key);
    if (!key || key.length > 120 || !/^[A-Z0-9_ -]+$/.test(key)) return response.status(400).json({ error: 'Некорректная механика' });
    let nameRu: string;
    try {
      nameRu = readTranslation(request.body?.nameRu ?? request.body?.name_ru);
    } catch (error) {
      return response.status(400).json({ error: error instanceof Error ? error.message : 'Некорректный перевод' });
    }
    const nameEn = mechanicEnglishLabel(request.body?.nameEn ?? request.body?.name_en ?? key).slice(0, 120);
    const timestamp = now().toISOString();
    try {
      dependencies.getDatabase().prepare(`
        INSERT INTO mechanic_translations (mechanic_key, name_en, name_ru, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(mechanic_key) DO UPDATE SET
          name_en = excluded.name_en,
          name_ru = excluded.name_ru,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `).run(key, nameEn, nameRu, timestamp, actor.id);
      dependencies.recordAudit?.(actor, 'mechanic-translation.updated', key, { nameEn, nameRu });
      return response.json({ success: true, translation: { key, nameEn, nameRu, source: 'manual', updatedAt: timestamp } });
    } catch {
      return response.status(500).json({ error: 'Не удалось сохранить перевод механики' });
    }
  });

  return router;
}
