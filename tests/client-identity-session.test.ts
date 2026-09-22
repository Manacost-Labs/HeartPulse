import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fetchCurrentAuthUser,
} from '../src/modules/identity/public.js';
import {
  logoutCurrentAuthSession,
  updateCurrentAuthProfile,
} from '../src/modules/identity/api/privateAccountApi.js';
import { authUserFromProfilePayload } from '../src/modules/identity/model/authProfile.js';
import {
  authErrorFromPayload,
  authSessionFromPayload,
  authUserFromValue,
} from '../src/modules/identity/model/authUser.js';

const baseUser = {
  id: 'user-1',
  profileId: 'user-1',
  publicProfileId: '17',
  email: 'member@example.com',
  name: 'Игрок',
  role: 'user',
  country: 'Россия',
  newsletterOptIn: true,
  telegramLinked: true,
  contactVkUrl: 'https://vk.com/player',
  contactTelegram: '@player',
  contactEmail: 'contact@example.com',
};

assert.deepEqual(
  authSessionFromPayload({
    user: { ...baseUser, secretToken: 'must-not-cross-the-client-contract' },
    adminAllowed: true,
    contestAdminAllowed: false,
  }),
  {
    user: {
      ...baseUser,
      adminAllowed: true,
      contestAdminAllowed: false,
    },
  },
  'the session parser must allowlist the browser user DTO and merge server permissions',
);
assert.deepEqual(
  authSessionFromPayload({ user: null, adminAllowed: false, contestAdminAllowed: false }),
  { user: null },
  'the explicit guest response must remain authoritative',
);
assert.equal(
  authSessionFromPayload({ user: { ...baseUser }, adminAllowed: 'false' }),
  null,
  'truthy strings must never grant browser permissions',
);
assert.equal(
  authSessionFromPayload({
    user: { ...baseUser, adminAllowed: true },
    adminAllowed: false,
    contestAdminAllowed: false,
  }),
  null,
  'conflicting permission sources must fail closed',
);
assert.equal(
  authSessionFromPayload({ adminAllowed: false, contestAdminAllowed: false }),
  null,
  'a malformed success payload must not be mistaken for a guest response',
);
assert.deepEqual(
  authUserFromProfilePayload({
    success: true,
    user: { ...baseUser, passwordHash: 'must-not-cross-the-client-contract' },
    adminAllowed: false,
    contestAdminAllowed: false,
  }),
  { ...baseUser, adminAllowed: false, contestAdminAllowed: false },
);
assert.equal(
  authUserFromProfilePayload({ success: true, user: baseUser }),
  null,
  'profile replacement must not silently discard the current permission contract',
);
assert.equal(authUserFromProfilePayload({ success: true, user: { name: 'Без email' } }), null);
assert.equal(
  authUserFromValue(Object.create({ email: 'inherited@example.com', name: 'Inherited', role: 'admin' })),
  null,
  'required identity fields must be own JSON properties',
);
assert.equal(
  authUserFromValue({ ...baseUser, telegramLinked: 'true' }),
  null,
  'mutable display fields must not masquerade as an immutable Telegram link flag',
);
assert.equal(
  authErrorFromPayload(Object.create({ error: 'inherited internal error' })),
  null,
  'an inherited value must not become a user-visible server error',
);
assert.equal(authErrorFromPayload({ error: 503 }), null);

const originalFetch = globalThis.fetch;
try {
  const controller = new AbortController();
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(JSON.stringify({
      user: baseUser,
      adminAllowed: true,
      contestAdminAllowed: false,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  assert.deepEqual(await fetchCurrentAuthUser(controller.signal), {
    ...baseUser,
    adminAllowed: true,
    contestAdminAllowed: false,
  });
  assert.equal(requestedUrl, '/api/auth/me');
  assert.equal(requestedInit?.credentials, 'same-origin');
  assert.equal(requestedInit?.cache, 'no-store');
  assert.equal(requestedInit?.signal, controller.signal);

  globalThis.fetch = (async () => new Response(JSON.stringify({
    user: null,
    adminAllowed: false,
    contestAdminAllowed: false,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
  assert.equal(await fetchCurrentAuthUser(controller.signal), null);

  let retryCount = 0;
  globalThis.fetch = (async () => {
    retryCount += 1;
    return new Response(JSON.stringify({ error: 'Временная ошибка сессии' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  await assert.rejects(fetchCurrentAuthUser(controller.signal), /Временная ошибка сессии/);
  assert.equal(retryCount, 3, 'transient session failures must keep the bounded retry policy');

  const abortController = new AbortController();
  let abortedRequestCount = 0;
  globalThis.fetch = (async () => {
    abortedRequestCount += 1;
    throw new Error('network unavailable');
  }) as typeof fetch;
  const abortedSessionRequest = fetchCurrentAuthUser(abortController.signal);
  globalThis.setTimeout(() => abortController.abort(), 10);
  await assert.rejects(
    abortedSessionRequest,
    error => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(abortedRequestCount, 1, 'an aborted session check must not start another retry');

  const profileUpdate = {
    country: 'Беларусь',
    newsletterOptIn: false,
    contactVkUrl: '',
    contactTelegram: '@new_player',
    contactEmail: 'new@example.com',
  };
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(JSON.stringify({
      success: true,
      user: { ...baseUser, ...profileUpdate },
      adminAllowed: false,
      contestAdminAllowed: false,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const widerProfileUpdate = {
    ...profileUpdate,
    role: 'admin',
    secretToken: 'must-not-leave-the-browser',
  };
  assert.deepEqual(await updateCurrentAuthProfile(widerProfileUpdate), {
    ...baseUser,
    ...profileUpdate,
    adminAllowed: false,
    contestAdminAllowed: false,
  });
  assert.equal(requestedUrl, '/api/auth/profile');
  assert.equal(requestedInit?.method, 'PATCH');
  assert.deepEqual(requestedInit?.headers, {
    'Content-Type': 'application/json',
    'X-CSRF-Request': '1',
  });
  assert.equal(requestedInit?.credentials, 'same-origin');
  assert.equal(requestedInit?.body, JSON.stringify(profileUpdate));

  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Профиль отклонён' }), {
    status: 422,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
  await assert.rejects(updateCurrentAuthProfile(profileUpdate), /Профиль отклонён/);

  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, user: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
  await assert.rejects(updateCurrentAuthProfile(profileUpdate), /Не удалось сохранить профиль/);

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(JSON.stringify({ error: 'Сервер ещё завершает сессию' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  await assert.doesNotReject(logoutCurrentAuthSession());
  assert.equal(requestedUrl, '/api/auth/logout');
  assert.equal(requestedInit?.method, 'POST');
  assert.deepEqual(requestedInit?.headers, {
    'Content-Type': 'application/json',
    'X-CSRF-Request': '1',
  });
  assert.equal(requestedInit?.credentials, 'same-origin');
  assert.equal(requestedInit?.body, undefined);
} finally {
  globalThis.fetch = originalFetch;
}

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const loginPanelSource = readFileSync(
  new URL('../src/modules/identity/ui/LoginPanel.tsx', import.meta.url),
  'utf8',
);
const publicEntrySource = readFileSync(
  new URL('../src/modules/identity/public.ts', import.meta.url),
  'utf8',
);

assert.doesNotMatch(appSource, /['"]\/api\/auth\/me['"]/, 'the app shell must delegate session I/O');
assert.match(appSource, /fetchCurrentAuthUser\(signal\)/);
assert.doesNotMatch(
  loginPanelSource,
  /['"]\/api\/auth\/(?:profile|logout)['"]/,
  'the login/profile UI must delegate private account I/O',
);
assert.match(loginPanelSource, /await updateCurrentAuthProfile\(\{/);
assert.match(loginPanelSource, /void logoutCurrentAuthSession\(\)\.catch/);
assert.match(appSource, /modules\/identity\/public/);
assert.match(loginPanelSource, /\.\.\/api\/privateAccountApi/);
assert.match(publicEntrySource, /\bfetchCurrentAuthUser\b/);
assert.doesNotMatch(
  publicEntrySource,
  /\b(?:logoutCurrentAuthSession|updateCurrentAuthProfile)\b/,
  'profile mutation authority must remain internal to the identity module',
);

console.log('client identity session API contracts passed');
