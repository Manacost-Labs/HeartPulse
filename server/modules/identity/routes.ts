import { Router, type Request, type Response } from 'express';
import type { AuthProfilePatch } from './model.js';
import {
  parseAuthProfilePatch,
  type AuthProfileContactNormalizers,
} from './schema.js';

export type AuthProfileRouterDependencies<User extends { id: string }> =
  AuthProfileContactNormalizers & {
    getSession: (request: Request) => {
      user: User;
      touch: (response: Response) => void;
    } | null;
    authenticate: (request: Request) => User | null;
    updateProfile: (userId: string, patch: AuthProfilePatch) => User | null;
    serializeUser: (user: User) => unknown;
    isAdmin: (user: User) => boolean;
    isContestAdmin: (user: User) => boolean;
    tokenFromRequest: (request: Request) => string;
    revokeSession: (token: string) => void;
    clearAuthCookie: (request: Request, response: Response) => void;
    setPrivateNoStore: (response: Response) => void;
  };

/**
 * Owns the private browser-session transport while authentication, persistence,
 * serialization and cookie policy remain explicit composition dependencies.
 */
export function createAuthProfileRouter<User extends { id: string }>(
  dependencies: AuthProfileRouterDependencies<User>,
): Router {
  const router = Router();

  router.get('/auth/me', (request, response) => {
    dependencies.setPrivateNoStore(response);
    try {
      const session = dependencies.getSession(request);
      if (!session) {
        return response.json({ user: null, adminAllowed: false, contestAdminAllowed: false });
      }
      session.touch(response);
      return response.json({
        user: dependencies.serializeUser(session.user),
        adminAllowed: dependencies.isAdmin(session.user),
        contestAdminAllowed: dependencies.isContestAdmin(session.user),
      });
    } catch {
      return response.status(503).json({ error: 'Не удалось проверить текущую сессию' });
    }
  });

  router.patch('/auth/profile', (request, response) => {
    dependencies.setPrivateNoStore(response);
    let authenticatedUser: User | null;
    try {
      authenticatedUser = dependencies.authenticate(request);
    } catch {
      return response.status(503).json({ error: 'Не удалось проверить текущую сессию' });
    }
    if (!authenticatedUser) return response.status(401).json({ error: 'Требуется вход' });

    const parsed = parseAuthProfilePatch(request.body, dependencies);
    if (parsed.ok === false) return response.status(400).json({ error: parsed.error });

    try {
      const updatedUser = dependencies.updateProfile(authenticatedUser.id, parsed.patch);
      if (!updatedUser) return response.status(401).json({ error: 'Пользователь не найден' });
      return response.json({ success: true, user: dependencies.serializeUser(updatedUser) });
    } catch {
      return response.status(500).json({ error: 'Не удалось обновить профиль' });
    }
  });

  router.post('/auth/logout', (request, response) => {
    dependencies.setPrivateNoStore(response);
    let failed = false;
    try {
      const token = dependencies.tokenFromRequest(request);
      if (token) dependencies.revokeSession(token);
    } catch {
      failed = true;
    } finally {
      dependencies.clearAuthCookie(request, response);
    }
    if (failed) return response.status(503).json({ error: 'Не удалось завершить все активные сессии' });
    return response.json({ success: true });
  });

  return router;
}
