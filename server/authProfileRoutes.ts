import { Router, type Request, type Response } from 'express';

export type AuthProfilePatch = {
  country?: string;
  newsletterOptIn?: boolean;
  contactVkUrl?: string;
  contactTelegram?: string;
  contactEmail?: string;
};

type AuthProfileSession<User> = {
  user: User;
  touch: (response: Response) => void;
};

export type AuthProfileRouterDependencies<User> = {
  getSession: (request: Request) => AuthProfileSession<User> | null;
  authenticate: (request: Request) => User | null;
  userId: (user: User) => string;
  updateProfile: (userId: string, patch: AuthProfilePatch) => User | null;
  serializeUser: (user: User) => unknown;
  isAdmin: (user: User) => boolean;
  isContestAdmin: (user: User) => boolean;
  tokenFromRequest: (request: Request) => string;
  revokeSession: (token: string) => void;
  clearAuthCookie: (request: Request, response: Response) => void;
  normalizeContactEmail: (value: unknown) => string;
  normalizeContactTelegram: (value: unknown) => string;
  normalizeContactVkUrl: (value: unknown) => string;
  setPrivateNoStore: (response: Response) => void;
};

type ProfileParseResult =
  | { ok: true; patch: AuthProfilePatch }
  | { ok: false; error: string };

const hasControlCharacters = (value: string) => /[\u0000-\u001f\u007f]/.test(value);

function readTextField(
  body: Record<string, unknown>,
  field: string,
  label: string,
  maxLength: number,
): { present: false } | { present: true; value: string } | { present: true; error: string } {
  if (!(field in body)) return { present: false };
  const raw = body[field];
  if (typeof raw !== 'string') return { present: true, error: `${label}: ожидается строка` };
  const value = raw.trim();
  if (value.length > maxLength) return { present: true, error: `${label}: превышена допустимая длина` };
  if (hasControlCharacters(value)) return { present: true, error: `${label}: недопустимые символы` };
  return { present: true, value };
}

export function parseAuthProfilePatch<User>(
  value: unknown,
  dependencies: Pick<
    AuthProfileRouterDependencies<User>,
    'normalizeContactEmail' | 'normalizeContactTelegram' | 'normalizeContactVkUrl'
  >,
): ProfileParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Тело запроса должно быть объектом' };
  }
  const body = value as Record<string, unknown>;
  const patch: AuthProfilePatch = {};

  if ('newsletterOptIn' in body) {
    if (typeof body.newsletterOptIn !== 'boolean') {
      return { ok: false, error: 'Некорректное значение согласия на рассылку' };
    }
    patch.newsletterOptIn = body.newsletterOptIn;
  }

  const country = readTextField(body, 'country', 'Страна', 80);
  if ('error' in country) return { ok: false, error: country.error };
  if (country.present) patch.country = country.value;

  const telegram = readTextField(body, 'contactTelegram', 'Telegram', 80);
  if ('error' in telegram) return { ok: false, error: telegram.error };
  if (telegram.present) patch.contactTelegram = dependencies.normalizeContactTelegram(telegram.value);

  const email = readTextField(body, 'contactEmail', 'Контактный email', 254);
  if ('error' in email) return { ok: false, error: email.error };
  if (email.present) {
    const normalized = dependencies.normalizeContactEmail(email.value);
    if (email.value && !normalized) return { ok: false, error: 'Контактный email указан некорректно' };
    patch.contactEmail = normalized;
  }

  const vk = readTextField(body, 'contactVkUrl', 'Ссылка VK', 240);
  if ('error' in vk) return { ok: false, error: vk.error };
  if (vk.present) {
    const normalized = dependencies.normalizeContactVkUrl(vk.value);
    if (vk.value && !normalized) return { ok: false, error: 'Ссылка VK указана некорректно' };
    patch.contactVkUrl = normalized;
  }

  return { ok: true, patch };
}

export function createAuthProfileRouter<User>(dependencies: AuthProfileRouterDependencies<User>): Router {
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
      const updatedUser = dependencies.updateProfile(dependencies.userId(authenticatedUser), parsed.patch);
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
