import { Router, type Request, type Response } from 'express';

export type AuthVerificationResult<User> =
  | { ok: true; user: User; sessionToken: string }
  | { ok: false; status: number; error: string };

type AuthenticatedPayloadDependencies<User> = {
  serializeUser: (user: User) => unknown;
  isAdmin: (user: User) => boolean;
  isContestAdmin: (user: User) => boolean;
};

export type AuthVerificationRouterDependencies<User> = AuthenticatedPayloadDependencies<User> & {
  normalizeEmail: (value: unknown) => string;
  isRealEmail: (email: string) => boolean;
  verify: (email: string, code: string) => AuthVerificationResult<User>;
  setAuthCookie: (request: Request, response: Response, token: string) => void;
  setPrivateNoStore: (response: Response) => void;
};

export function authenticatedUserPayload<User>(
  user: User,
  dependencies: AuthenticatedPayloadDependencies<User>,
) {
  return {
    success: true,
    user: dependencies.serializeUser(user),
    adminAllowed: dependencies.isAdmin(user),
    contestAdminAllowed: dependencies.isContestAdmin(user),
  };
}

export function createAuthVerificationRouter<User>(
  dependencies: AuthVerificationRouterDependencies<User>,
): Router {
  const router = Router();

  router.post('/auth/verify', (request, response) => {
    dependencies.setPrivateNoStore(response);
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      return response.status(400).json({ error: 'Тело запроса должно быть объектом' });
    }

    const body = request.body as Record<string, unknown>;
    const email = dependencies.normalizeEmail(body.email);
    if (email.length > 254 || !dependencies.isRealEmail(email)) {
      return response.status(400).json({ error: 'Укажите корректную почту' });
    }
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
      return response.status(400).json({ error: 'Укажите шестизначный код' });
    }

    try {
      const result = dependencies.verify(email, body.code);
      if (result.ok === false) return response.status(result.status).json({ error: result.error });
      dependencies.setAuthCookie(request, response, result.sessionToken);
      return response.json(authenticatedUserPayload(result.user, dependencies));
    } catch {
      return response.status(500).json({ error: 'Не удалось подтвердить вход' });
    }
  });

  return router;
}
