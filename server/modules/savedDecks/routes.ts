import { randomUUID } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  MAX_DECK_COMMENT_LENGTH,
  MAX_SAVED_DECKS,
  normalizeDeckComment,
  parseDeckInput,
  serializeSavedDeck,
  type SavedDeckFormat,
  type SavedDeckRecord,
} from './model.js';
import type { SavedDeckRepository } from './repository.js';

export type ResolvedSavedDeck = { deckCode: string; format: SavedDeckFormat; archetypeLabel: string | null };

export type SavedDecksRouterDependencies = {
  repository: SavedDeckRepository;
  userAuth: (request: Request) => { id: string } | null;
  csrfAllowed: (request: Request) => boolean;
  setPrivateNoStore: (response: Response) => void;
  /** A cheap local decode of a deck code, run before anything that costs a lookup. */
  isDeckCode: (deckCode: string) => boolean;
  /** Checks a deck code against the card catalog: null when it is not a playable deck; throws when the check failed. */
  resolveDeck: (deckCode: string) => Promise<ResolvedSavedDeck | null>;
  /**
   * The budget of the requests that start a render (adding, retrying). It is
   * part of the routes, so no spelling of the path (`/api//account/decks`)
   * reaches a handler past it.
   */
  renderLimiter?: RequestHandler;
  /** The deckview image of a deck (the site's shared render cache). */
  renderDeck: (deckCode: string, deckName: string) => Promise<{ imageUrl: string | null; previewImageUrl?: string | null }>;
  /** Maps a rendered image URL to the one the page loads (the site's resource proxy). */
  imageUrl?: (url: string) => string;
  now?: () => number;
  newId?: () => string;
};

const NOT_FOUND = { error: 'Колода не найдена' };

/**
 * Renders a deck's image after the answer was sent. A database error while
 * recording the result must not reject unhandled (it would stop the server):
 * the deck then stays `pending` and reads as `failed` after RENDER_STALE_MS.
 */
function startRender(dependencies: SavedDecksRouterDependencies, record: SavedDeckRecord, iso: () => string): void {
  const settle = (render: Parameters<SavedDeckRepository['setRender']>[1]) => {
    try {
      dependencies.repository.setRender(record.id, render, iso());
    } catch {
      // See above: the stale `pending` state offers a retry.
    }
  };
  void dependencies.renderDeck(record.deckCode, record.renderName).then(
    result => settle(result.imageUrl
      ? { status: 'ready', imageUrl: result.imageUrl, previewImageUrl: result.previewImageUrl || result.imageUrl }
      : { status: 'failed' }),
    () => settle({ status: 'failed' }),
  );
}

/** The signed-in owner of a request, or null with the answer already sent. */
function requestOwner(dependencies: SavedDecksRouterDependencies, request: Request, response: Response, change: boolean): { id: string } | null {
  dependencies.setPrivateNoStore(response);
  if (change && !dependencies.csrfAllowed(request)) {
    response.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
    return null;
  }
  const user = dependencies.userAuth(request);
  if (!user) response.status(401).json({ error: 'Требуется вход' });
  return user;
}

/**
 * The account's own saved decks: add by deck code with a comment, list as a
 * gallery, edit the comment, retry a failed image, delete. Cookie session
 * only; changes need the same-origin CSRF proof. The image is rendered after
 * the answer, so adding is instant and the page polls while a deck is
 * `pending`; a failed render keeps the deck and offers a retry.
 */
export function createSavedDecksRouter(dependencies: SavedDecksRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const newId = dependencies.newId ?? randomUUID;
  const iso = () => new Date(now()).toISOString();
  const { repository } = dependencies;
  const serialize = (record: SavedDeckRecord) => serializeSavedDeck(record, now(), dependencies.imageUrl);

  const limiter: RequestHandler = dependencies.renderLimiter ?? ((_request, _response, next) => next());
  const render = (record: SavedDeckRecord) => startRender(dependencies, record, iso);
  const owner = (request: Request, response: Response, change: boolean) => requestOwner(dependencies, request, response, change);


  router.get('/account/decks', (request, response) => {
    const user = owner(request, response, false);
    if (!user) return undefined;
    try {
      return response.json({ decks: repository.list(user.id).map(record => serialize(record)), limit: MAX_SAVED_DECKS });
    } catch {
      return response.status(503).json({ error: 'Не удалось загрузить колоды' });
    }
  });

  router.post('/account/decks', limiter, async (request, response) => {
    const user = owner(request, response, true);
    if (!user) return undefined;
    const input = parseDeckInput((request.body as { deckCode?: unknown } | undefined)?.deckCode, dependencies.isDeckCode);
    if (!input) return response.status(400).json({ error: 'Не нашли код колоды. Скопируйте колоду в игре и вставьте сюда.' });
    const comment = normalizeDeckComment((request.body as { comment?: unknown } | undefined)?.comment);
    if (comment === null) return response.status(400).json({ error: `Комментарий длиннее ${MAX_DECK_COMMENT_LENGTH} символов` });
    try {
      const resolved = await dependencies.resolveDeck(input.deckCode);
      if (!resolved) return response.status(400).json({ error: 'Это не код колоды Hearthstone. Проверьте, что скопировали его целиком.' });
      if (repository.hasCode(user.id, resolved.deckCode)) return response.status(409).json({ error: 'Эта колода уже сохранена' });
      if (repository.count(user.id) >= MAX_SAVED_DECKS) {
        return response.status(409).json({ error: `Можно сохранить до ${MAX_SAVED_DECKS} колод. Удалите ненужные.` });
      }
      const at = iso();
      const record: SavedDeckRecord = {
        id: newId(), userId: user.id, deckCode: resolved.deckCode,
        deckName: input.name || resolved.archetypeLabel || 'Колода', renderName: resolved.archetypeLabel || 'Колода',
        format: resolved.format, comment,
        status: 'pending', imageUrl: null, previewImageUrl: null, createdAt: at, updatedAt: at,
      };
      repository.insert(record);
      render(record);
      return response.status(201).json({ deck: serialize(record) });
    } catch (error) {
      // Two simultaneous saves of one deck: the unique index decides.
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
        return response.status(409).json({ error: 'Эта колода уже сохранена' });
      }
      return response.status(503).json({ error: 'Не удалось проверить колоду. Попробуйте ещё раз.' });
    }
  });

  router.patch('/account/decks/:id', (request, response) => {
    const user = owner(request, response, true);
    if (!user) return undefined;
    const raw = (request.body as { comment?: unknown } | undefined)?.comment;
    // A missing field must not silently erase the comment.
    const comment = typeof raw === 'string' ? normalizeDeckComment(raw) : null;
    if (comment === null) return response.status(400).json({ error: `Комментарий — текст до ${MAX_DECK_COMMENT_LENGTH} символов` });
    try {
      if (!repository.setComment(user.id, request.params.id, comment)) return response.status(404).json(NOT_FOUND);
      const record = repository.find(user.id, request.params.id);
      return record ? response.json({ deck: serialize(record) }) : response.status(404).json(NOT_FOUND);
    } catch {
      return response.status(503).json({ error: 'Не удалось сохранить комментарий' });
    }
  });

  router.post('/account/decks/:id/render', limiter, (request, response) => {
    const user = owner(request, response, true);
    if (!user) return undefined;
    try {
      const record = repository.find(user.id, request.params.id);
      if (!record) return response.status(404).json(NOT_FOUND);
      if (serialize(record).status !== 'failed') return response.json({ deck: serialize(record) });
      const at = iso();
      repository.setRender(record.id, { status: 'pending' }, at);
      render(record);
      return response.json({ deck: serialize({ ...record, status: 'pending', updatedAt: at }) });
    } catch {
      return response.status(503).json({ error: 'Не удалось собрать картинку' });
    }
  });

  router.delete('/account/decks/:id', (request, response) => {
    const user = owner(request, response, true);
    if (!user) return undefined;
    try {
      return repository.remove(user.id, request.params.id) ? response.json({ success: true }) : response.status(404).json(NOT_FOUND);
    } catch {
      return response.status(503).json({ error: 'Не удалось удалить колоду' });
    }
  });

  return router;
}
