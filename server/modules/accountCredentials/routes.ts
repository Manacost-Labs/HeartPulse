import { Router, type Request, type Response } from 'express';

export type RegistrationInput = {
  email: string;
  password: string;
  name: string;
  country: string;
  newsletterOptIn: true;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthCredentialResult =
  | { ok: true; payload: Record<string, unknown>; sessionToken?: string }
  | { ok: false; status: number; error: string };

export type AuthCredentialRouterDependencies = {
  normalizeEmail: (value: unknown) => string;
  isRealEmail: (email: string) => boolean;
  register: (input: RegistrationInput) => Promise<AuthCredentialResult> | AuthCredentialResult;
  login: (input: LoginInput, request: Request) => Promise<AuthCredentialResult> | AuthCredentialResult;
  setAuthCookie: (request: Request, response: Response, token: string) => void;
  setPrivateNoStore: (response: Response) => void;
  reportFailure?: (operation: 'register' | 'login', error: unknown) => void;
};

export async function deliverCredentialCode(
  deliver: () => Promise<void>,
  persist: () => void,
): Promise<void> {
  await deliver();
  persist();
}

const hasControlCharacters = (value: string) => /[\u0000-\u001f\u007f]/.test(value);

function objectBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function validEmail(
  body: Record<string, unknown>,
  dependencies: Pick<AuthCredentialRouterDependencies, 'normalizeEmail' | 'isRealEmail'>,
): string {
  if (typeof body.email !== 'string') return '';
  const email = dependencies.normalizeEmail(body.email);
  if (email.length > 254 || !dependencies.isRealEmail(email)) return '';
  return email;
}

function readBoundedText(
  body: Record<string, unknown>,
  field: string,
  label: string,
  fallback: string,
  maximumLength: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (!(field in body)) return { ok: true, value: fallback };
  const raw = body[field];
  if (typeof raw !== 'string') return { ok: false, error: `${label}: ожидается строка` };
  const value = raw.trim();
  if (value.length > maximumLength) return { ok: false, error: `${label}: превышена допустимая длина` };
  if (hasControlCharacters(value)) return { ok: false, error: `${label}: недопустимые символы` };
  return { ok: true, value: value || fallback };
}

async function respondWithResult(
  resultPromise: Promise<AuthCredentialResult> | AuthCredentialResult,
  request: Request,
  response: Response,
  dependencies: AuthCredentialRouterDependencies,
): Promise<Response> {
  const result = await resultPromise;
  if (result.ok === false) return response.status(result.status).json({ error: result.error });
  if (result.sessionToken) dependencies.setAuthCookie(request, response, result.sessionToken);
  return response.json(result.payload);
}

export function createAuthCredentialRouter(dependencies: AuthCredentialRouterDependencies): Router {
  const router = Router();

  router.post('/auth/register', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const body = objectBody(request.body);
    if (!body) return response.status(400).json({ error: 'Тело запроса должно быть объектом' });

    const email = validEmail(body, dependencies);
    if (!email) return response.status(400).json({ error: 'Укажите корректную почту' });
    if (typeof body.password !== 'string') {
      return response.status(400).json({ error: 'Пароль должен быть строкой' });
    }
    if (body.password.length < 8) {
      return response.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    }
    if (body.password.length > 128) {
      return response.status(400).json({ error: 'Пароль должен быть не длиннее 128 символов' });
    }

    const name = readBoundedText(body, 'name', 'Имя', 'Пользователь Манакоста', 80);
    if (name.ok === false) return response.status(400).json({ error: name.error });
    const country = readBoundedText(body, 'country', 'Страна', '', 80);
    if (country.ok === false) return response.status(400).json({ error: country.error });
    if (!country.value) return response.status(400).json({ error: 'Укажите страну' });
    if (typeof body.newsletterOptIn !== 'boolean') {
      return response.status(400).json({ error: 'Некорректное значение согласия на рассылку' });
    }
    if (!body.newsletterOptIn) {
      return response.status(400).json({ error: 'Подтвердите согласие на получение рассылки' });
    }

    try {
      return await respondWithResult(dependencies.register({
        email,
        password: body.password,
        name: name.value,
        country: country.value,
        newsletterOptIn: true,
      }), request, response, dependencies);
    } catch (error) {
      dependencies.reportFailure?.('register', error);
      return response.status(503).json({ error: 'Не удалось завершить регистрацию. Попробуйте позже' });
    }
  });

  router.post('/auth/login', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const body = objectBody(request.body);
    if (!body) return response.status(400).json({ error: 'Тело запроса должно быть объектом' });

    const email = validEmail(body, dependencies);
    if (!email) return response.status(400).json({ error: 'Укажите корректную почту' });
    if (typeof body.password !== 'string') {
      return response.status(400).json({ error: 'Пароль должен быть строкой' });
    }
    if (!body.password || body.password.length > 128) {
      return response.status(400).json({ error: 'Некорректный пароль' });
    }

    try {
      return await respondWithResult(
        dependencies.login({ email, password: body.password }, request),
        request,
        response,
        dependencies,
      );
    } catch (error) {
      dependencies.reportFailure?.('login', error);
      return response.status(503).json({ error: 'Не удалось отправить код входа. Попробуйте позже' });
    }
  });

  return router;
}
