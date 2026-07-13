import assert from 'node:assert/strict';
import express from 'express';
import {
  completePasswordReset,
  createPasswordResetRouter,
  type PasswordResetStore,
} from '../server/passwordResetRoutes.js';

const genericRequestResponse = {
  success: true,
  email: 'member@example.com',
  message: 'Если аккаунт существует, код отправлен на почту',
};

let requestFailure = false;
let confirmResult = false;
let issuedEmails: string[] = [];
let confirmCalls: Array<{ email: string; code: string; password: string }> = [];
let reportedFailures = 0;

const app = express();
app.use(express.json());
app.use('/api', createPasswordResetRouter({
  normalizeEmail: value => String(value ?? '').trim().toLowerCase(),
  isRealEmail: email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  issueReset: async email => {
    issuedEmails.push(email);
    if (requestFailure) throw new Error('sendmail path and secret details');
  },
  confirmReset: (email, code, password) => {
    confirmCalls.push({ email, code, password });
    return confirmResult;
  },
  reportRequestFailure: () => { reportedFailures += 1; },
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');

const api = (path: string, body: unknown) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

try {
  const request = await api('/auth/password-reset/request', { email: ' MEMBER@EXAMPLE.COM ' });
  assert.equal(request.status, 200);
  assert.equal(request.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await request.json(), genericRequestResponse);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(issuedEmails, ['member@example.com']);

  requestFailure = true;
  const hiddenFailure = await api('/auth/password-reset/request', { email: 'member@example.com' });
  assert.equal(hiddenFailure.status, 200);
  assert.deepEqual(await hiddenFailure.json(), genericRequestResponse);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(reportedFailures, 1);

  for (const body of [[], {}, { email: 'invalid' }, { email: 'x'.repeat(255) }]) {
    const invalid = await api('/auth/password-reset/request', body);
    assert.equal(invalid.status, 400, JSON.stringify(body));
    assert.deepEqual(await invalid.json(), { error: 'Укажите корректную почту' });
  }

  const invalidConfirmCases: Array<[unknown, string]> = [
    [[], 'Тело запроса'],
    [{ email: 'invalid', code: '123456', password: 'correct horse' }, 'почту'],
    [{ email: 'member@example.com', code: '12a456', password: 'correct horse' }, 'шестизначный'],
    [{ email: 'member@example.com', code: '123456', password: 'short' }, 'не короче'],
    [{ email: 'member@example.com', code: '123456', password: 'x'.repeat(129) }, 'не длиннее'],
    [{ email: 'member@example.com', code: '123456', password: { value: 'password' } }, 'Пароль'],
  ];
  for (const [body, messagePart] of invalidConfirmCases) {
    const invalid = await api('/auth/password-reset/confirm', body);
    assert.equal(invalid.status, 400, JSON.stringify(body));
    assert.match(String((await invalid.json() as any).error), new RegExp(messagePart, 'i'));
  }

  confirmResult = false;
  const rejected = await api('/auth/password-reset/confirm', {
    email: 'member@example.com', code: '123456', password: 'correct horse',
  });
  assert.equal(rejected.status, 401);
  assert.deepEqual(await rejected.json(), { error: 'Неверный или устаревший код' });

  confirmResult = true;
  const confirmed = await api('/auth/password-reset/confirm', {
    email: 'member@example.com', code: '123456', password: 'correct horse',
  });
  assert.equal(confirmed.status, 200);
  assert.deepEqual(await confirmed.json(), { success: true, message: 'Пароль обновлен' });
  assert.deepEqual(confirmCalls.at(-1), {
    email: 'member@example.com', code: '123456', password: 'correct horse',
  });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

const makeStore = (): PasswordResetStore => ({
  users: [{ email: 'member@example.com', passwordHash: 'old-hash', updatedAt: 'old-date' }],
  pendingCodes: [{ email: 'member@example.com', codeHash: 'expected', expiresAt: 2_000, attempts: 0 }],
  sessions: [
    { email: 'member@example.com' },
    { email: 'other@example.com' },
  ],
});
let persisted = 0;
const resetDependencies = {
  now: () => 1_000,
  maxAttempts: 5,
  verifyCode: (pending: PasswordResetStore['pendingCodes'][number], code: string) => (
    pending.codeHash === 'expected' && code === '123456'
  ),
  hashPassword: (password: string) => `hash:${password}`,
  persist: () => { persisted += 1; },
};

const successfulStore = makeStore();
assert.equal(completePasswordReset(successfulStore, 'member@example.com', '123456', 'new-password', resetDependencies), true);
assert.equal(successfulStore.users[0].passwordHash, 'hash:new-password');
assert.equal(successfulStore.pendingCodes.length, 0);
assert.deepEqual(successfulStore.sessions, [{ email: 'other@example.com' }]);
assert.equal(persisted, 1);

const failedStore = makeStore();
assert.equal(completePasswordReset(failedStore, 'member@example.com', '000000', 'new-password', resetDependencies), false);
assert.equal(failedStore.pendingCodes[0].attempts, 1);
assert.equal(failedStore.users[0].passwordHash, 'old-hash');
assert.equal(failedStore.sessions.length, 2);
assert.equal(persisted, 2);

const missingStore = makeStore();
assert.equal(completePasswordReset(missingStore, 'missing@example.com', '123456', 'new-password', resetDependencies), false);
assert.equal(persisted, 2, 'missing accounts must not mutate or persist auth state');

const expiredStore = makeStore();
expiredStore.pendingCodes[0].expiresAt = 999;
assert.equal(completePasswordReset(expiredStore, 'member@example.com', '123456', 'new-password', resetDependencies), false);
assert.equal(persisted, 2);

console.log('password reset router and session revocation tests passed');
