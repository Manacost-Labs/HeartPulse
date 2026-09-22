import {
  consumeTelegramAuthIntent,
  createTelegramSignInIntent,
  parseTelegramAuthIntents,
  type TelegramAuthIntent,
} from './intent.js';

type TelegramAuthIntentCookieDependencies<Request, Response> = {
  cookieName: string;
  path: string;
  legacyCookieName: string;
  legacyPath: string;
  secret: string;
  ttlMs: number;
  now: () => number;
  randomNonce: () => string;
  readCookie: (request: Request, cookieName: string) => string;
  appendSetCookie: (response: Response, cookie: string) => void;
  secure: (request: Request) => boolean;
  legacyDomain: (request: Request) => string;
  encode: (value: unknown, secret: string) => string;
  decode: (value: string, secret: string) => unknown | null;
};

export function createTelegramAuthIntentCookieManager<Request, Response>(
  dependencies: TelegramAuthIntentCookieDependencies<Request, Response>,
) {
  const attributes = (request: Request, path: string, maxAge: number) => [
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    dependencies.secure(request) ? 'Secure' : '',
  ].filter(Boolean);

  const clearLegacy = (request: Request, response: Response) => {
    if (dependencies.cookieName === dependencies.legacyCookieName) return;
    const paths = new Set([dependencies.legacyPath, '/']);
    const domain = dependencies.legacyDomain(request);
    for (const path of paths) {
      dependencies.appendSetCookie(response, [
        `${dependencies.legacyCookieName}=`,
        ...attributes(request, path, 0),
      ].join('; '));
      if (domain) {
        dependencies.appendSetCookie(response, [
          `${dependencies.legacyCookieName}=`,
          ...attributes(request, path, 0),
          domain,
        ].join('; '));
      }
    }
  };

  const clear = (request: Request, response: Response) => {
    dependencies.appendSetCookie(response, [
      `${dependencies.cookieName}=`,
      ...attributes(request, dependencies.path, 0),
    ].join('; '));
    clearLegacy(request, response);
  };

  const read = (request: Request): TelegramAuthIntent[] => {
    const raw = dependencies.readCookie(request, dependencies.cookieName);
    if (!raw) return [];
    return parseTelegramAuthIntents(
      dependencies.decode(raw, dependencies.secret),
      dependencies.now(),
    );
  };

  const write = (
    request: Request,
    response: Response,
    values: readonly TelegramAuthIntent[],
  ) => {
    const intents = parseTelegramAuthIntents(values, dependencies.now());
    if (!intents.length) {
      clear(request, response);
      return;
    }
    const expiresAt = Math.max(...intents.map(intent => intent.expiresAt));
    const encoded = dependencies.encode({ intents }, dependencies.secret);
    if (dependencies.cookieName.startsWith('__Host-')
      && (dependencies.path !== '/' || !dependencies.secure(request))) {
      throw new Error('__Host- Telegram intent cookie requires HTTPS and Path=/');
    }
    dependencies.appendSetCookie(response, [
      `${dependencies.cookieName}=${encodeURIComponent(encoded)}`,
      ...attributes(
        request,
        dependencies.path,
        Math.max(1, Math.ceil((expiresAt - dependencies.now()) / 1000)),
      ),
    ].join('; '));
    clearLegacy(request, response);
  };

  return {
    issue(request: Request, response: Response): TelegramAuthIntent {
      const intent = createTelegramSignInIntent({
        nonce: dependencies.randomNonce(),
        now: dependencies.now(),
        ttlMs: dependencies.ttlMs,
      });
      write(request, response, [...read(request), intent]);
      return intent;
    },
    take(request: Request, response: Response, nonce: string): TelegramAuthIntent | null {
      const result = consumeTelegramAuthIntent(read(request), nonce, dependencies.now());
      write(request, response, result.remaining);
      return result.intent;
    },
  };
}
