import { Router, type Response } from 'express';

export type PasswordResetStore = {
  users: Array<{ email: string; passwordHash: string; updatedAt: string }>;
  pendingCodes: Array<{ email: string; codeHash: string; expiresAt: number; attempts: number }>;
  sessions: Array<{ email: string }>;
};

type CompletePasswordResetDependencies<Store extends PasswordResetStore> = {
  now: () => number;
  maxAttempts: number;
  verifyCode: (pending: Store['pendingCodes'][number], code: string) => boolean;
  hashPassword: (password: string) => string;
  persist: (store: Store) => void;
};

export type PasswordResetRouterDependencies = {
  normalizeEmail: (value: unknown) => string;
  isRealEmail: (email: string) => boolean;
  issueReset: (email: string) => Promise<void> | void;
  confirmReset: (email: string, code: string, password: string) => boolean;
  reportRequestFailure?: (error: unknown) => void;
  setPrivateNoStore: (response: Response) => void;
};

export function completePasswordReset<Store extends PasswordResetStore>(
  store: Store,
  email: string,
  code: string,
  password: string,
  dependencies: CompletePasswordResetDependencies<Store>,
): boolean {
  const now = dependencies.now();
  const user = store.users.find(item => item.email === email);
  const pending = store.pendingCodes.find(item => item.email === email && item.expiresAt > now);
  if (!user || !pending) return false;

  pending.attempts += 1;
  if (pending.attempts > dependencies.maxAttempts || !dependencies.verifyCode(pending, code)) {
    dependencies.persist(store);
    return false;
  }

  user.passwordHash = dependencies.hashPassword(password);
  user.updatedAt = new Date(now).toISOString();
  store.pendingCodes = store.pendingCodes.filter(item => item.email !== email);
  store.sessions = store.sessions.filter(item => item.email !== email);
  dependencies.persist(store);
  return true;
}

const requestPayload = (email: string) => ({
  success: true,
  email,
  message: 'Если аккаунт существует, код отправлен на почту',
});

function validEmailFromBody(
  body: unknown,
  dependencies: Pick<PasswordResetRouterDependencies, 'normalizeEmail' | 'isRealEmail'>,
): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const email = dependencies.normalizeEmail((body as Record<string, unknown>).email);
  if (email.length > 254 || !dependencies.isRealEmail(email)) return '';
  return email;
}

export function createPasswordResetRouter(dependencies: PasswordResetRouterDependencies): Router {
  const router = Router();

  router.post('/auth/password-reset/request', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const email = validEmailFromBody(request.body, dependencies);
    if (!email) return response.status(400).json({ error: 'Укажите корректную почту' });

    void Promise.resolve()
      .then(() => dependencies.issueReset(email))
      .catch(error => dependencies.reportRequestFailure?.(error));
    return response.json(requestPayload(email));
  });

  router.post('/auth/password-reset/confirm', (request, response) => {
    dependencies.setPrivateNoStore(response);
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      return response.status(400).json({ error: 'Тело запроса должно быть объектом' });
    }

    const body = request.body as Record<string, unknown>;
    const email = validEmailFromBody(body, dependencies);
    if (!email) return response.status(400).json({ error: 'Укажите корректную почту' });
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
      return response.status(400).json({ error: 'Укажите шестизначный код' });
    }
    if (typeof body.password !== 'string') {
      return response.status(400).json({ error: 'Пароль должен быть строкой' });
    }
    if (body.password.length < 8) {
      return response.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    }
    if (body.password.length > 128) {
      return response.status(400).json({ error: 'Пароль должен быть не длиннее 128 символов' });
    }

    try {
      if (!dependencies.confirmReset(email, body.code, body.password)) {
        return response.status(401).json({ error: 'Неверный или устаревший код' });
      }
      return response.json({ success: true, message: 'Пароль обновлен' });
    } catch {
      return response.status(500).json({ error: 'Не удалось обновить пароль' });
    }
  });

  return router;
}
