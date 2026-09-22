import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import express from 'express';
import {
  createAuthProfileRouter,
  type AuthProfilePatch,
} from '../server/modules/identity/public.js';

const moduleInventory = JSON.parse(readFileSync(
  new URL('../config/module-boundaries.json', import.meta.url),
  'utf8',
)) as {
  modules: Array<{
    id: string;
    root: string;
    publicEntry: string;
    focusedTests: string[];
    docs: string[];
  }>;
};
const identityBoundary = moduleInventory.modules.find(({ id }) => id === 'server.identity');
assert.ok(identityBoundary, 'server.identity must be registered in the module inventory');
assert.deepEqual({
  root: identityBoundary.root,
  publicEntry: identityBoundary.publicEntry,
}, {
  root: 'server/modules/identity',
  publicEntry: 'server/modules/identity/public.ts',
});
assert.ok(identityBoundary.focusedTests.includes('npm run test:auth-profile-routes'));
for (const documentationPath of [
  'docs/architecture/module-boundaries.md',
  'docs/architecture/modularization-plan.md',
]) {
  assert.ok(identityBoundary.docs.includes(documentationPath),
    `server.identity must name its owning document ${documentationPath}`);
}

const runtimeInventory = JSON.parse(readFileSync(
  new URL('../config/runtime-service-inventory.json', import.meta.url),
  'utf8',
)) as {
  routerGroups: Array<{ id: string; source: string }>;
};
assert.equal(
  runtimeInventory.routerGroups.find(({ id }) => id === 'router-arena-identity')?.source,
  'frontend:server/modules/identity/public.ts',
  'the runtime inventory must point at the identity public entry',
);

assert.equal(existsSync(new URL('../server/authProfileRoutes.ts', import.meta.url)), false,
  'the legacy auth-profile route owner must be retired');

const serverCompositionRoot = readFileSync(
  new URL('../server/index.ts', import.meta.url),
  'utf8',
);
assert.match(serverCompositionRoot, /from '\.\/modules\/identity\/public\.js';/,
  'the server composition root must enter identity through public.ts');
assert.doesNotMatch(serverCompositionRoot, /from '\.\/authProfileRoutes\.js';/,
  'the server composition root must not retain the legacy route owner');
const identityMountPosition = serverCompositionRoot.indexOf("app.use('/api', createAuthProfileRouter(");
assert.ok(identityMountPosition >= 0, 'the identity router must remain mounted below /api');
for (const [label, marker] of [
  ['API rate limiter', "app.use('/api/', apiLimiter);"],
  ['cookie mutation CSRF guard', "app.use('/api/', (req, res, next) => {"],
  ['route-aware body parser', 'app.use(createRouteAwareJsonParser({'],
] as const) {
  const middlewarePosition = serverCompositionRoot.indexOf(marker);
  assert.ok(middlewarePosition >= 0 && middlewarePosition < identityMountPosition,
    `${label} must remain mounted before the private identity router`);
}

type User = {
  id: string;
  email: string;
  country: string;
  newsletterOptIn: boolean;
  role: string;
  passwordHash: string;
};

const user: User = {
  id: 'user-1',
  email: 'member@example.com',
  country: 'Россия',
  newsletterOptIn: false,
  role: 'user',
  passwordHash: 'must-not-leak',
};
let storedUser: User = { ...user };
let touchedSessions = 0;
let revokedTokens: string[] = [];
let clearedCookies = 0;
let updateFailure = false;
let missingOnUpdate = false;
let revokeFailure = false;
let sessionFailure = false;
let touchFailure = false;
let authenticationFailure = false;
let tokenExtractionFailure = false;
let adminAllowed = false;
let contestAdminAllowed = false;
let lastPatch: AuthProfilePatch | null = null;
let lastUpdateUserId = '';

const app = express();
app.use(express.json());
app.use('/api', createAuthProfileRouter({
  getSession: request => {
    if (sessionFailure) throw new Error('session store path and secret details');
    return request.headers.authorization === 'Bearer valid-token'
      ? {
        user: storedUser,
        touch: response => {
          if (touchFailure) throw new Error('session refresh internals and secret details');
          touchedSessions += 1;
          response.append('Set-Cookie', 'auth=refreshed; Path=/; HttpOnly');
        },
      }
      : null;
  },
  authenticate: request => {
    if (authenticationFailure) throw new Error('authentication internals and secret details');
    return request.headers.authorization === 'Bearer valid-token'
      ? storedUser
      : null;
  },
  updateProfile: (userId, patch) => {
    if (updateFailure) throw new Error('database path and secret details');
    lastUpdateUserId = userId;
    lastPatch = patch;
    if (missingOnUpdate) return null;
    storedUser = {
      ...storedUser,
      ...(patch.country === undefined ? {} : { country: patch.country }),
      ...(patch.newsletterOptIn === undefined ? {} : { newsletterOptIn: patch.newsletterOptIn }),
    };
    return storedUser;
  },
  serializeUser: currentUser => ({
    id: currentUser.id,
    email: currentUser.email,
    country: currentUser.country,
    newsletterOptIn: currentUser.newsletterOptIn,
  }),
  isAdmin: () => adminAllowed,
  isContestAdmin: () => contestAdminAllowed,
  tokenFromRequest: request => {
    if (tokenExtractionFailure) throw new Error('token extraction internals and secret details');
    return String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  },
  revokeSession: token => {
    if (revokeFailure) throw new Error('session store secret details');
    revokedTokens.push(token);
  },
  clearAuthCookie: (_request, response) => {
    clearedCookies += 1;
    response.append('Set-Cookie', 'auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  },
  normalizeContactEmail: value => {
    const email = String(value ?? '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  },
  normalizeContactTelegram: value => String(value ?? '').trim().replace(/^@+/, ''),
  normalizeContactVkUrl: value => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return /^https:\/\/vk\.com\/[a-z0-9_.]+$/i.test(raw) ? raw : '';
  },
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'no-store');
    response.vary('Cookie');
    response.vary('Authorization');
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');

const api = (path: string, init: RequestInit = {}, authenticated = true) => fetch(
  `http://127.0.0.1:${address.port}/api${path}`,
  {
    ...init,
    headers: {
      ...(authenticated ? { Authorization: 'Bearer valid-token' } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  },
);

function assertPrivateResponseHeaders(response: Response) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(String(response.headers.get('vary')), /Cookie/i);
  assert.match(String(response.headers.get('vary')), /Authorization/i);
}

function assertExpiredAuthCookie(response: Response) {
  assert.match(String(response.headers.get('set-cookie')), /auth=;[^,]*Max-Age=0/i);
}

try {
  const guest = await api('/auth/me', {}, false);
  assert.equal(guest.status, 200);
  assertPrivateResponseHeaders(guest);
  assert.deepEqual(await guest.json(), { user: null, adminAllowed: false, contestAdminAllowed: false });
  assert.equal(touchedSessions, 0, 'guest requests must not refresh a session');

  const me = await api('/auth/me');
  assert.equal(me.status, 200);
  assertPrivateResponseHeaders(me);
  assert.equal(touchedSessions, 1);
  assert.match(String(me.headers.get('set-cookie')), /auth=refreshed/);
  assert.deepEqual(await me.json(), {
    user: {
      id: user.id,
      email: user.email,
      country: user.country,
      newsletterOptIn: user.newsletterOptIn,
    },
    adminAllowed: false,
    contestAdminAllowed: false,
  });

  adminAllowed = true;
  contestAdminAllowed = true;
  const privileged = await api('/auth/me');
  assert.equal(privileged.status, 200);
  assertPrivateResponseHeaders(privileged);
  assert.deepEqual(await privileged.json(), {
    user: {
      id: user.id,
      email: user.email,
      country: user.country,
      newsletterOptIn: user.newsletterOptIn,
    },
    adminAllowed: true,
    contestAdminAllowed: true,
  });

  adminAllowed = false;
  const contestOnly = await api('/auth/me');
  assert.equal(contestOnly.status, 200);
  assertPrivateResponseHeaders(contestOnly);
  assert.deepEqual(await contestOnly.json(), {
    user: {
      id: user.id,
      email: user.email,
      country: user.country,
      newsletterOptIn: user.newsletterOptIn,
    },
    adminAllowed: false,
    contestAdminAllowed: true,
  });
  contestAdminAllowed = false;

  touchFailure = true;
  const failedTouch = await api('/auth/me');
  assert.equal(failedTouch.status, 503);
  assertPrivateResponseHeaders(failedTouch);
  assert.deepEqual(await failedTouch.json(), { error: 'Не удалось проверить текущую сессию' });
  touchFailure = false;

  sessionFailure = true;
  const failedSession = await api('/auth/me');
  assert.equal(failedSession.status, 503);
  assertPrivateResponseHeaders(failedSession);
  assert.deepEqual(await failedSession.json(), { error: 'Не удалось проверить текущую сессию' });
  sessionFailure = false;

  const denied = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ country: 'Польша' }) }, false);
  assert.equal(denied.status, 401);
  assertPrivateResponseHeaders(denied);
  assert.deepEqual(await denied.json(), { error: 'Требуется вход' });

  authenticationFailure = true;
  const failedAuthentication = await api('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ country: 'Польша' }),
  });
  assert.equal(failedAuthentication.status, 503);
  assertPrivateResponseHeaders(failedAuthentication);
  assert.deepEqual(await failedAuthentication.json(), { error: 'Не удалось проверить текущую сессию' });
  authenticationFailure = false;

  const invalidBodies: Array<[unknown, string]> = [
    [[], 'Тело запроса'],
    [{ newsletterOptIn: 'yes' }, 'согласия'],
    [{ country: { value: 'Россия' } }, 'Страна'],
    [{ country: 'x'.repeat(81) }, 'Страна'],
    [{ contactTelegram: 'x'.repeat(81) }, 'Telegram'],
    [{ contactEmail: 'not-an-email' }, 'email'],
    [{ contactVkUrl: 'javascript:alert(1)' }, 'VK'],
    [{ contactVkUrl: 'https://evil.example/user' }, 'VK'],
    [{ country: 'Россия\u0000' }, 'Страна'],
  ];
  for (const [body, messagePart] of invalidBodies) {
    const response = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) });
    assert.equal(response.status, 400, JSON.stringify(body));
    assertPrivateResponseHeaders(response);
    assert.match(String((await response.json() as any).error), new RegExp(messagePart, 'i'));
  }

  const updated = await api('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      country: '  Польша  ',
      newsletterOptIn: true,
      contactTelegram: '@member_name',
      contactEmail: ' MEMBER@EXAMPLE.COM ',
      contactVkUrl: 'https://vk.com/member.name',
      id: 'attacker-selected-user',
      userId: 'attacker-selected-user',
      role: 'admin',
      passwordHash: 'attacker-value',
      blockedAt: '',
      adminAllowed: true,
    }),
  });
  assert.equal(updated.status, 200);
  assertPrivateResponseHeaders(updated);
  assert.equal(lastUpdateUserId, user.id, 'the update target must come from the authenticated user');
  assert.deepEqual(lastPatch, {
    country: 'Польша',
    newsletterOptIn: true,
    contactTelegram: 'member_name',
    contactEmail: 'member@example.com',
    contactVkUrl: 'https://vk.com/member.name',
  });
  assert.deepEqual(await updated.json(), {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      country: 'Польша',
      newsletterOptIn: true,
    },
  });

  missingOnUpdate = true;
  const missing = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ country: 'Литва' }) });
  assert.equal(missing.status, 401);
  assertPrivateResponseHeaders(missing);
  assert.deepEqual(await missing.json(), { error: 'Пользователь не найден' });
  missingOnUpdate = false;

  updateFailure = true;
  const failedUpdate = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ country: 'Литва' }) });
  assert.equal(failedUpdate.status, 500);
  assertPrivateResponseHeaders(failedUpdate);
  assert.deepEqual(await failedUpdate.json(), { error: 'Не удалось обновить профиль' });
  updateFailure = false;

  const guestLogout = await api('/auth/logout', { method: 'POST' }, false);
  assert.equal(guestLogout.status, 200);
  assertPrivateResponseHeaders(guestLogout);
  assertExpiredAuthCookie(guestLogout);
  assert.deepEqual(await guestLogout.json(), { success: true });
  assert.deepEqual(revokedTokens, []);
  assert.equal(clearedCookies, 1);

  const logout = await api('/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 200);
  assertPrivateResponseHeaders(logout);
  assertExpiredAuthCookie(logout);
  assert.deepEqual(await logout.json(), { success: true });
  assert.deepEqual(revokedTokens, ['valid-token']);
  assert.equal(clearedCookies, 2);

  revokeFailure = true;
  const failedLogout = await api('/auth/logout', { method: 'POST' });
  assert.equal(failedLogout.status, 503);
  assertPrivateResponseHeaders(failedLogout);
  assertExpiredAuthCookie(failedLogout);
  assert.deepEqual(await failedLogout.json(), { error: 'Не удалось завершить все активные сессии' });
  assert.equal(clearedCookies, 3, 'local auth cookie must be cleared even when revocation fails');
  revokeFailure = false;

  tokenExtractionFailure = true;
  const failedTokenExtraction = await api('/auth/logout', { method: 'POST' });
  assert.equal(failedTokenExtraction.status, 503);
  assertPrivateResponseHeaders(failedTokenExtraction);
  assertExpiredAuthCookie(failedTokenExtraction);
  assert.deepEqual(await failedTokenExtraction.json(), { error: 'Не удалось завершить все активные сессии' });
  assert.equal(clearedCookies, 4, 'local auth cookie must be cleared when token extraction fails');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('auth profile router contract tests passed');
