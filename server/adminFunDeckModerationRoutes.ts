import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import {
  clearFunDeckModeration,
  findFunDeckModeration,
  saveFunDeckModeration,
  type FunDeckModerationAction,
} from './adminFunDeckModerationStore.js';
import type { FunDeckRow } from './funDeckRows.js';

type AdminIdentity = { id: string };

export type AdminFunDeckModerationDependencies = {
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => AdminIdentity | null;
  getDatabase: () => DatabaseSync;
  /** The current selection, normalized. */
  loadDecks: () => Promise<FunDeckRow[]>;
  setPrivateNoStore: (response: Response) => void;
  recordAudit?: (actor: AdminIdentity, action: string, entityId: string, details?: Record<string, unknown>) => void;
  onError?: (error: unknown) => void;
  now?: () => Date;
};

const FORMATS = ['standard', 'wild'];
const ACTIONS = ['hide', 'pin', 'clear'];
const MAX_DECK_CODE = 400;
const MAX_NOTE = 500;

type Command = { format: string; deckCode: string; action: FunDeckModerationAction | 'clear'; note: string | null };

/** The request's command, or the Russian reason it is not one. */
function parseCommand(body: unknown): Command | { error: string } {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const format = typeof input.format === 'string' ? input.format.toLowerCase() : '';
  if (!FORMATS.includes(format)) return { error: 'Формат должен быть standard или wild' };
  const action = typeof input.action === 'string' ? input.action : '';
  if (!ACTIONS.includes(action)) return { error: 'Действие должно быть hide, pin или clear' };
  const deckCode = typeof input.deckCode === 'string' ? input.deckCode.trim() : '';
  if (!deckCode || deckCode.length > MAX_DECK_CODE) return { error: `Код колоды обязателен, не длиннее ${MAX_DECK_CODE} символов` };
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') return { error: 'Заметка должна быть текстом' };
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > MAX_NOTE) return { error: `Заметка не длиннее ${MAX_NOTE} символов` };
  return { format, deckCode, action: action as Command['action'], note: note || null };
}

/** `POST /admin/fun-decks/moderation`: hide a deck, pin it, or return it to the ordinary selection. */
export function createAdminFunDeckModerationRouter(dependencies: AdminFunDeckModerationDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());

  router.post('/admin/fun-decks/moderation', dependencies.adminGuard, async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const actor = dependencies.adminAuth(request);
    if (!actor) return response.status(401).json({ error: 'Требуется вход' });
    const command = parseCommand(request.body);
    if ('error' in command) return response.status(400).json({ error: command.error });
    try {
      const database = dependencies.getDatabase();
      if (command.action !== 'clear') {
        const current = findFunDeckModeration(database, command.format, command.deckCode);
        const deck = (await dependencies.loadDecks())
          .find(row => row.format.toLowerCase() === command.format && row.deckCode === command.deckCode);
        const snapshot = deck ?? current?.snapshot ?? null;
        if (!snapshot) return response.status(404).json({ error: 'Такой колоды нет в текущей выборке' });
        saveFunDeckModeration(database, { ...command, action: command.action, snapshot, updatedBy: actor.id, updatedAt: now().toISOString() });
      } else {
        clearFunDeckModeration(database, command.format, command.deckCode);
      }
      dependencies.recordAudit?.(actor, `fun-deck.${command.action}`, `${command.format}:${command.deckCode}`, { note: command.note });
      return response.json({ success: true, format: command.format, deckCode: command.deckCode, moderation: command.action === 'clear' ? null : command.action });
    } catch (error) {
      dependencies.onError?.(error);
      return response.status(502).json({ error: 'Не удалось сохранить решение по колоде' });
    }
  });

  return router;
}
