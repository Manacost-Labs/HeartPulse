import { Router, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { accountSessionViews, publicSessionId, PUBLIC_SESSION_ID } from './model.js';
import type { AccountSessionStore } from './repository.js';

export type AccountSessionsRouterDependencies = {
  /** The request's own session, or null for a guest or an ended session. */
  currentSession: (request: Request) => { userId: string; tokenHash: string } | null;
  sessions: AccountSessionStore;
  /** The site's cookie-mutation CSRF rule (same origin plus `X-CSRF-Request`). */
  csrfAllowed: (request: Request) => boolean;
  /** Applied to both revocations; by default 20 per 15 minutes per account. */
  mutationLimiter?: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  now?: () => number;
};

const FORBIDDEN = { error: 'Запрос отклонён' };
const SIGN_IN_REQUIRED = { error: 'Требуется вход' };
const UNAVAILABLE = { error: 'Не удалось загрузить сеансы' };

/**
 * The viewer's active sessions and how to end them. A session id from another
 * account is answered exactly like an unknown one, and the current session is
 * ended only by signing out, which also clears this browser's cookies.
 */
export function createAccountSessionsRouter(dependencies: AccountSessionsRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  // The limiter and the handler ask for the same request's session; it is resolved once.
  const resolved = new WeakMap<Request, ReturnType<AccountSessionsRouterDependencies['currentSession']>>();
  const currentSession = (request: Request) => {
    if (!resolved.has(request)) resolved.set(request, dependencies.currentSession(request));
    return resolved.get(request) ?? null;
  };
  const mutationLimiter = dependencies.mutationLimiter ?? rateLimit({
    windowMs: 15 * 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    // A guest is refused by the route itself; the site-wide API limit covers it.
    skip: request => !currentSession(request),
    keyGenerator: request => `account-sessions:${currentSession(request)?.userId ?? ''}`,
    message: { error: 'Слишком много запросов. Попробуйте позже.' },
  });
  const guarded = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    if (request.method !== 'GET' && !dependencies.csrfAllowed(request)) {
      response.status(403).json(FORBIDDEN);
      return null;
    }
    const session = currentSession(request);
    if (!session) response.status(401).json(SIGN_IN_REQUIRED);
    return session;
  };

  router.get('/account/sessions', (request, response) => {
    try {
      const session = guarded(request, response);
      if (!session) return undefined;
      return response.json({ sessions: accountSessionViews(dependencies.sessions.list(session.userId, now()), session.tokenHash) });
    } catch {
      return response.status(503).json(UNAVAILABLE);
    }
  });

  router.post('/account/sessions/revoke-others', mutationLimiter, (request, response) => {
    try {
      const session = guarded(request, response);
      if (!session) return undefined;
      return response.json({ revoked: dependencies.sessions.revokeOthers(session.userId, session.tokenHash) });
    } catch {
      return response.status(503).json({ error: 'Не удалось завершить сеансы' });
    }
  });

  router.post('/account/sessions/:id/revoke', mutationLimiter, (request, response) => {
    try {
      const session = guarded(request, response);
      if (!session) return undefined;
      const id = String(request.params.id ?? '');
      const target = PUBLIC_SESSION_ID.test(id)
        ? dependencies.sessions.list(session.userId, now()).find(item => publicSessionId(item.tokenHash) === id)
        : undefined;
      // Ids are matched only among the viewer's own sessions, so another account's id is simply unknown.
      if (!target) return response.status(404).json({ error: 'Сеанс не найден' });
      if (target.tokenHash === session.tokenHash) {
        return response.status(409).json({ error: 'Этот браузер выходит кнопкой «Выйти»' });
      }
      if (!dependencies.sessions.revoke(session.userId, target.tokenHash)) return response.status(404).json({ error: 'Сеанс не найден' });
      return response.json({ revoked: 1 });
    } catch {
      return response.status(503).json({ error: 'Не удалось завершить сеанс' });
    }
  });

  return router;
}
