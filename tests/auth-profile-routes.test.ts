import assert from 'node:assert/strict';
import express from 'express';
import { createAuthProfileRouter, type AuthProfilePatch } from '../server/authProfileRoutes.js';

type User = { id: string; email: string; country: string; newsletterOptIn: boolean };

const user: User = {
  id: 'user-1',
  email: 'member@example.com',
  country: 'Россия',
  newsletterOptIn: false,
};
let sessionEnabled = true;
let storedUser: User | null = { ...user };
let touchedSessions = 0;
let revokedTokens: string[] = [];
let clearedCookies = 0;
let updateFailure = false;
let revokeFailure = false;
let lastPatch: AuthProfilePatch | null = null;

const app = express();
app.use(express.json());
app.use('/api', createAuthProfileRouter({
  getSession: request => sessionEnabled && request.headers.authorization === 'Bearer valid-token'
    ? { user: storedUser ?? user, touch: () => { touchedSessions += 1; } }
    : null,
  authenticate: request => sessionEnabled && request.headers.authorization === 'Bearer valid-token'
    ? storedUser
    : null,
  userId: currentUser => currentUser.id,
  updateProfile: (_userId, patch) => {
    if (updateFailure) throw new Error('database path and secret details');
    lastPatch = patch;
    if (!storedUser) return null;
    storedUser = {
      ...storedUser,
      ...(patch.country === undefined ? {} : { country: patch.country }),
      ...(patch.newsletterOptIn === undefined ? {} : { newsletterOptIn: patch.newsletterOptIn }),
    };
    return storedUser;
  },
  serializeUser: currentUser => ({ ...currentUser }),
  isAdmin: () => false,
  isContestAdmin: () => false,
  tokenFromRequest: request => String(request.headers.authorization || '').replace(/^Bearer\s+/i, ''),
  revokeSession: token => {
    if (revokeFailure) throw new Error('session store secret details');
    revokedTokens.push(token);
  },
  clearAuthCookie: () => { clearedCookies += 1; },
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
    response.set('Cache-Control', 'private, no-store');
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

try {
  const guest = await api('/auth/me', {}, false);
  assert.equal(guest.status, 200);
  assert.equal(guest.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await guest.json(), { user: null, adminAllowed: false, contestAdminAllowed: false });

  const me = await api('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(touchedSessions, 1);
  assert.equal((await me.json() as any).user.email, user.email);

  const denied = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ country: 'Польша' }) }, false);
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');

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
    }),
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(lastPatch, {
    country: 'Польша',
    newsletterOptIn: true,
    contactTelegram: 'member_name',
    contactEmail: 'member@example.com',
    contactVkUrl: 'https://vk.com/member.name',
  });
  assert.equal((await updated.json() as any).user.country, 'Польша');

  storedUser = null;
  const missing = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ country: 'Литва' }) });
  assert.equal(missing.status, 401);
  storedUser = { ...user };

  updateFailure = true;
  const failedUpdate = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ country: 'Литва' }) });
  assert.equal(failedUpdate.status, 500);
  assert.deepEqual(await failedUpdate.json(), { error: 'Не удалось обновить профиль' });
  updateFailure = false;

  const logout = await api('/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 200);
  assert.deepEqual(revokedTokens, ['valid-token']);
  assert.equal(clearedCookies, 1);

  revokeFailure = true;
  const failedLogout = await api('/auth/logout', { method: 'POST' });
  assert.equal(failedLogout.status, 503);
  assert.deepEqual(await failedLogout.json(), { error: 'Не удалось завершить все активные сессии' });
  assert.equal(clearedCookies, 2, 'local auth cookie must be cleared even when revocation fails');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('auth profile router contract tests passed');
