import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  confirmPasswordReset,
  registerPasswordAccount,
  requestPasswordLogin,
  requestPasswordReset,
  verifyEmailAuthCode,
} from '../src/modules/identity/api/guestAuthApi.js';
import {
  authUserFromSuccessPayload,
} from '../src/modules/identity/model/authUser.js';
import {
  canAccessAdminWorkspace,
  canManageContests,
} from '../src/modules/identity/model/authAccess.js';

const baseUser = {
  id: 'user-1',
  profileId: 'user-1',
  publicProfileId: '17',
  email: 'member@example.com',
  name: 'Игрок',
  role: 'user',
  country: 'Беларусь',
  newsletterOptIn: true,
  contactVkUrl: 'https://vk.com/player',
  contactTelegram: '@player',
  contactEmail: 'contact@example.com',
  adminAllowed: false,
  contestAdminAllowed: true,
};

assert.deepEqual(
  authUserFromSuccessPayload({
    success: true,
    user: { ...baseUser, passwordHash: 'must-not-cross-the-browser-contract' },
    adminAllowed: false,
    contestAdminAllowed: true,
  }),
  baseUser,
  'authenticated success payloads must expose only the canonical browser user allowlist',
);
assert.equal(authUserFromSuccessPayload({ success: false, user: baseUser }), null);
assert.equal(authUserFromSuccessPayload({ success: true, user: null }), null);
assert.equal(
  authUserFromSuccessPayload({
    success: true,
    user: { ...baseUser, contestAdminAllowed: false },
    contestAdminAllowed: true,
  }),
  null,
  'conflicting permission sources must fail closed in every authenticated flow',
);
assert.equal(
  authUserFromSuccessPayload(Object.create({ success: true, user: baseUser })),
  null,
  'required success fields must be own JSON properties',
);
assert.equal(
  authUserFromSuccessPayload({
    success: true,
    user: { email: 'member@example.com', name: 'Игрок', role: 'user' },
  }),
  null,
  'authenticated success payloads without explicit permissions must fail closed',
);
assert.equal(canAccessAdminWorkspace({ ...baseUser, role: 'admin', adminAllowed: false }), false);
assert.equal(canManageContests({
  ...baseUser,
  id: 'user_42368c85b8de',
  profileId: 'user_42368c85b8de',
  contestAdminAllowed: false,
}), false, 'legacy IDs must not bypass validated server permissions');
assert.equal(canAccessAdminWorkspace({ ...baseUser, adminAllowed: true }), true);
assert.equal(canManageContests({ ...baseUser, contestAdminAllowed: true }), true);

const originalFetch = globalThis.fetch;
let requestedUrl = '';
let requestedInit: RequestInit | undefined;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

try {
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return jsonResponse({
      success: true,
      authenticated: true,
      user: { ...baseUser, secretToken: 'must-not-cross-the-browser-contract' },
      adminAllowed: false,
      contestAdminAllowed: true,
      message: 'Вы уже вошли в аккаунт.',
    });
  }) as typeof fetch;

  const widerLoginInput = {
    email: 'member@example.com',
    password: 'correct horse',
    role: 'admin',
    secretToken: 'must-not-leave-the-browser',
  };
  assert.deepEqual(await requestPasswordLogin(widerLoginInput), {
    kind: 'authenticated',
    user: baseUser,
  });
  assert.equal(requestedUrl, '/api/auth/login');
  assert.equal(requestedInit?.method, 'POST');
  assert.deepEqual(requestedInit?.headers, { 'Content-Type': 'application/json' });
  assert.equal(requestedInit?.credentials, 'same-origin');
  assert.equal(requestedInit?.body, JSON.stringify({
    email: 'member@example.com',
    password: 'correct horse',
  }));

  globalThis.fetch = (async () => jsonResponse({
    success: true,
    email: 'member@example.com',
    message: 'Код отправлен на почту',
  })) as typeof fetch;
  assert.deepEqual(await requestPasswordLogin({
    email: 'member@example.com',
    password: 'correct horse',
  }), { kind: 'verification-required' });

  globalThis.fetch = (async () => jsonResponse({
    success: true,
    authenticated: true,
    message: 'Вы уже вошли в аккаунт.',
  })) as typeof fetch;
  await assert.rejects(
    requestPasswordLogin({ email: 'member@example.com', password: 'correct horse' }),
    /Ошибка входа/,
    'an authenticated response without a user must fail closed',
  );

  globalThis.fetch = (async () => new Response('not json', { status: 200 })) as typeof fetch;
  await assert.rejects(
    requestPasswordLogin({ email: 'member@example.com', password: 'correct horse' }),
    /Ошибка входа/,
    'a non-JSON success response must use the stable generic error',
  );

  globalThis.fetch = (async () => jsonResponse({
    success: true,
    authenticated: true,
    user: { ...baseUser, contestAdminAllowed: 'true' },
  })) as typeof fetch;
  await assert.rejects(
    requestPasswordLogin({ email: 'member@example.com', password: 'correct horse' }),
    /Ошибка входа/,
    'malformed successful login data must not authenticate the browser',
  );

  globalThis.fetch = (async () => jsonResponse({ error: 'Неверная почта или пароль' }, 401)) as typeof fetch;
  await assert.rejects(
    requestPasswordLogin({ email: 'member@example.com', password: 'wrong password' }),
    /Неверная почта или пароль/,
  );

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return jsonResponse({ success: true, email: 'member@example.com', message: 'Код отправлен' });
  }) as typeof fetch;
  const widerRegistration = {
    email: 'member@example.com',
    name: 'Игрок',
    country: 'Беларусь',
    newsletterOptIn: true,
    password: 'correct horse',
    adminAllowed: true,
  };
  await assert.doesNotReject(registerPasswordAccount(widerRegistration));
  assert.equal(requestedUrl, '/api/auth/register');
  assert.equal(requestedInit?.method, 'POST');
  assert.deepEqual(requestedInit?.headers, { 'Content-Type': 'application/json' });
  assert.equal(requestedInit?.credentials, 'same-origin');
  assert.equal(requestedInit?.body, JSON.stringify({
    email: 'member@example.com',
    name: 'Игрок',
    country: 'Беларусь',
    newsletterOptIn: true,
    password: 'correct horse',
  }));

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return jsonResponse({
      success: true,
      email: 'member@example.com',
      message: 'Если аккаунт существует, код отправлен на почту',
    });
  }) as typeof fetch;
  assert.deepEqual(await requestPasswordReset({ email: 'member@example.com' }), {
    message: 'Если аккаунт существует, код отправлен на почту',
  });
  assert.equal(requestedUrl, '/api/auth/password-reset/request');
  assert.deepEqual(requestedInit?.headers, { 'Content-Type': 'application/json' });
  assert.equal(requestedInit?.credentials, 'same-origin');
  assert.equal(requestedInit?.body, JSON.stringify({ email: 'member@example.com' }));

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return jsonResponse({ success: true, message: 'Пароль обновлен' });
  }) as typeof fetch;
  const widerResetConfirmation = {
    email: 'member@example.com',
    code: '123456',
    password: 'new correct horse',
    secretToken: 'must-not-leave-the-browser',
  };
  await assert.doesNotReject(confirmPasswordReset(widerResetConfirmation));
  assert.equal(requestedUrl, '/api/auth/password-reset/confirm');
  assert.deepEqual(requestedInit?.headers, { 'Content-Type': 'application/json' });
  assert.equal(requestedInit?.credentials, 'same-origin');
  assert.equal(requestedInit?.body, JSON.stringify({
    email: 'member@example.com',
    code: '123456',
    password: 'new correct horse',
  }));

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return jsonResponse({
      success: true,
      user: { ...baseUser, blockedAt: 'must-not-cross-the-browser-contract' },
      adminAllowed: false,
      contestAdminAllowed: true,
    });
  }) as typeof fetch;
  const widerVerification = {
    email: 'member@example.com',
    code: '123456',
    role: 'admin',
  };
  assert.deepEqual(await verifyEmailAuthCode(widerVerification), baseUser);
  assert.equal(requestedUrl, '/api/auth/verify');
  assert.deepEqual(requestedInit?.headers, { 'Content-Type': 'application/json' });
  assert.equal(requestedInit?.credentials, 'same-origin');
  assert.equal(requestedInit?.body, JSON.stringify({
    email: 'member@example.com',
    code: '123456',
  }));

  globalThis.fetch = (async () => jsonResponse({ success: true, message: 503 })) as typeof fetch;
  await assert.rejects(
    requestPasswordReset({ email: 'member@example.com' }),
    /Не удалось отправить код/,
    'malformed success metadata must use the stable generic error',
  );

  globalThis.fetch = (async () => jsonResponse({ success: true })) as typeof fetch;
  await assert.rejects(
    registerPasswordAccount(widerRegistration),
    /Ошибка регистрации/,
    'a bare success marker must not complete a credential command',
  );

  globalThis.fetch = (async () => jsonResponse({ success: 'true', message: 'Код отправлен' })) as typeof fetch;
  await assert.rejects(
    requestPasswordReset({ email: 'member@example.com' }),
    /Не удалось отправить код/,
    'string success markers must fail closed',
  );

  let failedRequestCount = 0;
  globalThis.fetch = (async () => {
    failedRequestCount += 1;
    return jsonResponse({ error: 'Сервис временно недоступен' }, 503);
  }) as typeof fetch;
  await assert.rejects(
    confirmPasswordReset(widerResetConfirmation),
    /Сервис временно недоступен/,
  );
  assert.equal(failedRequestCount, 1, 'credential mutations must never retry implicitly');
} finally {
  globalThis.fetch = originalFetch;
}

const loginPanelSource = readFileSync(
  new URL('../src/modules/identity/ui/LoginPanel.tsx', import.meta.url),
  'utf8',
);
const contestsSource = readFileSync(new URL('../src/features/Contests.tsx', import.meta.url), 'utf8');
const identityPublicSource = readFileSync(
  new URL('../src/modules/identity/public.ts', import.meta.url),
  'utf8',
);

for (const endpoint of [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/password-reset/request',
  '/api/auth/password-reset/confirm',
  '/api/auth/verify',
]) {
  assert.doesNotMatch(
    loginPanelSource,
    new RegExp(`['"]${endpoint.replaceAll('/', '\\/')}['"]`),
    `LoginPanel must delegate ${endpoint} transport`,
  );
}
assert.match(loginPanelSource, /\.\.\/api\/guestAuthApi/);
assert.doesNotMatch(loginPanelSource, /setAuthUser\(data\.user\)/);
assert.match(contestsSource, /import type \{ AuthUser \} from '\.\.\/modules\/identity\/public';/);
assert.doesNotMatch(contestsSource, /type AuthUser\s*=\s*\{/);
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(appSource, /appAuthUser\.(?:role|id|profileId)\s*===/);
assert.doesNotMatch(contestsSource, /CONTEST_ADMIN_USER_ID|authUser\.role\s*===\s*['"]admin['"]/);
assert.match(identityPublicSource, /\bcanAccessAdminWorkspace\b/);
assert.match(identityPublicSource, /\bcanManageContests\b/);
assert.doesNotMatch(
  identityPublicSource,
  /\b(?:requestPasswordLogin|registerPasswordAccount|requestPasswordReset|confirmPasswordReset|verifyEmailAuthCode)\b/,
  'guest-auth mutation authority must remain internal to identity',
);

console.log('client identity guest-auth contracts passed');
