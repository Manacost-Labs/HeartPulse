import { Router, type Request, type Response } from 'express';
import {
  ADMIN_CRM_SCHEMA_SQL,
  NOTES_SQL,
  noteView,
  readPersonCard,
  readSegments,
  tagsFor,
  type AdminCrmRepository,
} from './adminCrmReadModel.js';

export { ADMIN_CRM_SCHEMA_SQL };
export type { AdminCrmRepository };

export type AdminCrmDependencies = {
  adminAuth: (request: Request) => { id: string } | null;
  csrfAllowed: (request: Request) => boolean;
  setPrivateNoStore: (response: Response) => void;
  repository: AdminCrmRepository;
  recordAudit: (actorId: string, action: string, userId: string, details: Record<string, unknown>) => void;
};

export const ADMIN_NOTE_MAX_LENGTH = 2000;
export const ADMIN_TAG_MAX_LENGTH = 32;
export const ADMIN_TAGS_PER_USER = 12;

export class AdminCrmInputError extends Error {}

/** Trims, lower-cases and deduplicates tags; drops empty and over-long values. */
export function normalizeAdminTags(input: unknown): string[] {
  if (!Array.isArray(input)) throw new AdminCrmInputError('Теги должны быть массивом строк');
  const tags = new Set<string>();
  for (const value of input) {
    const tag = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (tag && tag.length <= ADMIN_TAG_MAX_LENGTH) tags.add(tag);
  }
  if (tags.size > ADMIN_TAGS_PER_USER) throw new AdminCrmInputError(`Можно указать не больше ${ADMIN_TAGS_PER_USER} тегов`);
  return [...tags];
}

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const userIdParam = (request: Request) => String(request.params.userId ?? '').trim().slice(0, 160);

export function createAdminCrmRouter(dependencies: AdminCrmDependencies): Router {
  const router = Router();
  const { repository } = dependencies;

  const authorize = (request: Request, response: Response, mutation = false) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) {
      response.status(403).json({ error: 'Недостаточно прав' });
      return null;
    }
    if (mutation && !dependencies.csrfAllowed(request)) {
      response.status(403).json({ error: 'Запрос отклонён: обновите страницу и повторите действие' });
      return null;
    }
    return admin;
  };
  const userExists = (userId: string) => Boolean(userId && repository.get('SELECT 1 AS found FROM users WHERE id = ?', userId));

  router.get('/admin/crm/segments', (request, response) => {
    if (!authorize(request, response)) return;
    try {
      return response.json(readSegments(repository));
    } catch {
      return response.status(500).json({ error: 'Не удалось посчитать сегменты' });
    }
  });

  router.get('/admin/crm/people/:userId', (request, response) => {
    if (!authorize(request, response)) return;
    const userId = userIdParam(request);
    try {
      const card = readPersonCard(repository, userId);
      if (!card) return response.status(404).json({ error: 'Пользователь не найден' });
      return response.json(card);
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить карточку пользователя' });
    }
  });

  router.post('/admin/crm/people/:userId/notes', (request, response) => {
    const admin = authorize(request, response, true);
    if (!admin) return;
    const userId = userIdParam(request);
    const body = str((request.body as Record<string, unknown> | undefined)?.body).trim();
    if (!body || body.length > ADMIN_NOTE_MAX_LENGTH) {
      return response.status(400).json({ error: `Заметка должна содержать от 1 до ${ADMIN_NOTE_MAX_LENGTH} символов` });
    }
    try {
      if (!userExists(userId)) return response.status(404).json({ error: 'Пользователь не найден' });
      const { lastInsertRowid } = repository.run(
        'INSERT INTO admin_user_notes (user_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?)',
        userId, admin.id, body, new Date().toISOString(),
      );
      dependencies.recordAudit(admin.id, 'user.note.added', userId, { noteId: lastInsertRowid });
      const note = repository.get(`${NOTES_SQL} WHERE n.id = ?`, lastInsertRowid);
      return response.status(201).json({ note: note ? noteView(note) : null });
    } catch {
      return response.status(500).json({ error: 'Не удалось сохранить заметку' });
    }
  });

  router.delete('/admin/crm/people/:userId/notes/:noteId', (request, response) => {
    const admin = authorize(request, response, true);
    if (!admin) return;
    const userId = userIdParam(request);
    const noteId = Number(request.params.noteId);
    if (!Number.isSafeInteger(noteId) || noteId <= 0) return response.status(404).json({ error: 'Заметка не найдена' });
    try {
      const { changes } = repository.run('DELETE FROM admin_user_notes WHERE id = ? AND user_id = ?', noteId, userId);
      if (!changes) return response.status(404).json({ error: 'Заметка не найдена' });
      dependencies.recordAudit(admin.id, 'user.note.deleted', userId, { noteId });
      return response.json({ ok: true });
    } catch {
      return response.status(500).json({ error: 'Не удалось удалить заметку' });
    }
  });

  router.put('/admin/crm/people/:userId/tags', (request, response) => {
    const admin = authorize(request, response, true);
    if (!admin) return;
    const userId = userIdParam(request);
    let tags: string[];
    try {
      tags = normalizeAdminTags((request.body as Record<string, unknown> | undefined)?.tags);
    } catch (error) {
      return response.status(400).json({ error: error instanceof Error ? error.message : 'Некорректные теги' });
    }
    try {
      if (!userExists(userId)) return response.status(404).json({ error: 'Пользователь не найден' });
      const before = tagsFor(repository, userId);
      const timestamp = new Date().toISOString();
      const wanted = new Set(tags);
      const existing = new Set(before);
      for (const tag of before) {
        if (!wanted.has(tag)) repository.run('DELETE FROM admin_user_tags WHERE user_id = ? AND tag = ?', userId, tag);
      }
      for (const tag of tags) {
        if (!existing.has(tag)) {
          repository.run('INSERT INTO admin_user_tags (user_id, tag, created_by, created_at) VALUES (?, ?, ?, ?)', userId, tag, admin.id, timestamp);
        }
      }
      dependencies.recordAudit(admin.id, 'user.tags.updated', userId, { from: before, to: tags });
      return response.json({ tags: tagsFor(repository, userId) });
    } catch {
      return response.status(500).json({ error: 'Не удалось сохранить теги' });
    }
  });

  return router;
}
