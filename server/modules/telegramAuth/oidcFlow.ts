export type TelegramOidcState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  purpose: 'sign-in' | 'link';
  linkUserId?: string;
  linkSessionHash?: string;
  returnTo: string;
  expiresAt: number;
};

export function telegramOidcLinkUserId(
  state: TelegramOidcState,
  activeSession: { userId: string; sessionHash: string } | null,
): string | undefined {
  if (state.purpose === 'sign-in') return undefined;
  if (!activeSession
    || !state.linkUserId
    || !state.linkSessionHash
    || activeSession.userId !== state.linkUserId
    || activeSession.sessionHash !== state.linkSessionHash) {
    throw new Error('Telegram link session no longer matches the authenticated account');
  }
  return state.linkUserId;
}

type TelegramOidcFlowDependencies<Request, Response> = {
  cookieName: string;
  legacyCookieName: string;
  secret: string;
  ttlMs: number;
  clientId: string;
  redirectUri: string;
  now: () => number;
  randomToken: (bytes: number) => string;
  loadAuthorizationEndpoint: () => Promise<string>;
  codeChallenge: (verifier: string) => string;
  safeReturnTo: (value: unknown) => string;
  readCookie: (request: Request, name: string) => string;
  appendSetCookie: (response: Response, cookie: string) => void;
  secure: (request: Request) => boolean;
  legacyDomain: (request: Request) => string;
  encode: (value: unknown, secret: string) => string;
  decode: (value: string, secret: string) => unknown | null;
};

function parseOidcState(value: unknown, now: number, safeReturnTo: (value: unknown) => string): TelegramOidcState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    const purpose = candidate.purpose === 'link' ? 'link' : 'sign-in';
    const token = (key: string, maxLength = 256) => (
      typeof candidate[key] === 'string'
      && (candidate[key] as string).length <= maxLength
      && /^[A-Za-z0-9_-]+$/.test(candidate[key] as string)
        ? candidate[key] as string
        : ''
    );
    const state = token('state');
    const nonce = token('nonce');
    const codeVerifier = token('codeVerifier');
    const linkUserId = purpose === 'link' ? token('linkUserId', 128) : '';
    const linkSessionHash = purpose === 'link' && typeof candidate.linkSessionHash === 'string'
      && /^[a-f0-9]{64}$/.test(candidate.linkSessionHash)
      ? candidate.linkSessionHash
      : '';
    const expiresAt = Number(candidate.expiresAt);
    if (!state || !nonce || !codeVerifier || !Number.isFinite(expiresAt)
      || expiresAt <= now
      || (purpose === 'link' && (!linkUserId || !linkSessionHash))) return null;
    return {
      state,
      nonce,
      codeVerifier,
      purpose,
      linkUserId: linkUserId || undefined,
      linkSessionHash: linkSessionHash || undefined,
      returnTo: safeReturnTo(candidate.returnTo),
      expiresAt,
    };
}

export function createTelegramOidcFlow<Request, Response>(
  dependencies: TelegramOidcFlowDependencies<Request, Response>,
) {
  const stateFromValue = (value: unknown) => parseOidcState(value, dependencies.now(), dependencies.safeReturnTo);

  const read = (request: Request): TelegramOidcState[] => {
    const raw = dependencies.readCookie(request, dependencies.cookieName);
    if (!raw) return [];
    try {
      const decoded = dependencies.decode(raw, dependencies.secret);
      const container = decoded && typeof decoded === 'object' && !Array.isArray(decoded)
        ? decoded as Record<string, unknown>
        : {};
      const values = Array.isArray(container.states) ? container.states : [decoded];
      return values
        .map(stateFromValue)
        .filter((state): state is TelegramOidcState => Boolean(state))
        .slice(-5);
    } catch {
      return [];
    }
  };

  const cookieAttributes = (request: Request, maxAge: number, path = '/') => [
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    dependencies.secure(request) ? 'Secure' : '',
  ].filter(Boolean);

  const clearLegacy = (request: Request, response: Response) => {
    if (dependencies.cookieName === dependencies.legacyCookieName) return;
    const attributes = cookieAttributes(request, 0, '/api/auth/telegram');
    dependencies.appendSetCookie(response, [
      `${dependencies.legacyCookieName}=`,
      ...attributes,
    ].join('; '));
    const legacyDomain = dependencies.legacyDomain(request);
    if (legacyDomain) {
      dependencies.appendSetCookie(response, [
        `${dependencies.legacyCookieName}=`,
        ...attributes,
        legacyDomain,
      ].join('; '));
    }
  };

  const write = (request: Request, response: Response, values: readonly TelegramOidcState[]) => {
    const states = values.map(stateFromValue)
      .filter((state): state is TelegramOidcState => Boolean(state))
      .slice(-5);
    if (dependencies.cookieName.startsWith('__Host-') && !dependencies.secure(request)) {
      throw new Error('__Host- Telegram OIDC cookie requires HTTPS');
    }
    const maxAge = states.length
      ? Math.max(1, Math.ceil((Math.max(...states.map(state => state.expiresAt)) - dependencies.now()) / 1_000))
      : 0;
    const value = states.length
      ? encodeURIComponent(dependencies.encode({ states }, dependencies.secret))
      : '';
    dependencies.appendSetCookie(response, [
      `${dependencies.cookieName}=${value}`,
      ...cookieAttributes(request, maxAge),
    ].join('; '));
    clearLegacy(request, response);
  };

  return {
    async begin(request: Request, response: Response, input: {
      purpose: 'sign-in' | 'link';
      returnTo: unknown;
      linkUserId?: string;
      linkSessionHash?: string;
    }): Promise<string> {
      const authorizationEndpoint = await dependencies.loadAuthorizationEndpoint();
      const nextState = stateFromValue({
        state: dependencies.randomToken(24),
        nonce: dependencies.randomToken(24),
        codeVerifier: dependencies.randomToken(48),
        purpose: input.purpose,
        linkUserId: input.linkUserId,
        linkSessionHash: input.linkSessionHash,
        returnTo: input.returnTo,
        expiresAt: dependencies.now() + dependencies.ttlMs,
      });
      if (!nextState) throw new Error('Invalid Telegram OIDC state');
      write(request, response, [...read(request), nextState]);
      const params = new URLSearchParams({
        client_id: dependencies.clientId,
        response_type: 'code',
        scope: 'openid profile',
        redirect_uri: dependencies.redirectUri,
        state: nextState.state,
        nonce: nextState.nonce,
        code_challenge: dependencies.codeChallenge(nextState.codeVerifier),
        code_challenge_method: 'S256',
      });
      return `${authorizationEndpoint}?${params.toString()}`;
    },
    take(request: Request, response: Response, stateValue: string): TelegramOidcState | null {
      const states = read(request);
      const state = states.find(candidate => candidate.state === stateValue) ?? null;
      write(request, response, state
        ? states.filter(candidate => candidate.state !== state.state)
        : states);
      return state;
    },
  };
}
