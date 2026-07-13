import assert from 'node:assert/strict';
import express from 'express';
import {
  createAuthCredentialRouter,
  deliverCredentialCode,
  type AuthCredentialResult,
  type LoginInput,
  type RegistrationInput,
} from '../server/authCredentialRoutes.js';

let registerCalls: RegistrationInput[] = [];
let loginCalls: LoginInput[] = [];
let cookieTokens: string[] = [];
let failures: Array<'register' | 'login'> = [];
let registerResult: AuthCredentialResult = {
  ok: true,
  payload: { success: true, email: 'member@example.com', message: 'Код отправлен' },
};
let loginResult: AuthCredentialResult = {
  ok: true,
  payload: { success: true, authenticated: true, user: { id: 'user-1' } },
  sessionToken: 'cookie-only-session',
};

const app = express();
app.use(express.json());
app.use('/api', createAuthCredentialRouter({
  normalizeEmail: value => String(value ?? '').trim().toLowerCase(),
  isRealEmail: email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  register: async input => {
    registerCalls.push(input);
    if (input.email === 'throw@example.com') throw new Error('smtp password and filesystem path');
    return registerResult;
  },
  login: async input => {
    loginCalls.push(input);
    if (input.email === 'throw@example.com') throw new Error('smtp password and filesystem path');
    return loginResult;
  },
  setAuthCookie: (_request, _response, token) => { cookieTokens.push(token); },
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  reportFailure: operation => { failures.push(operation); },
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
  const invalidRegistrationCases: Array<[unknown, string]> = [
    [[], 'Тело запроса'],
    [{ email: 'invalid', password: 'correct horse', country: 'Россия', newsletterOptIn: true }, 'почту'],
    [{ email: 'x'.repeat(255), password: 'correct horse', country: 'Россия', newsletterOptIn: true }, 'почту'],
    [{ email: 'member@example.com', password: { value: 'correct horse' }, country: 'Россия', newsletterOptIn: true }, 'Пароль'],
    [{ email: 'member@example.com', password: 'short', country: 'Россия', newsletterOptIn: true }, 'не короче'],
    [{ email: 'member@example.com', password: 'x'.repeat(129), country: 'Россия', newsletterOptIn: true }, 'не длиннее'],
    [{ email: 'member@example.com', password: 'correct horse', name: 'x'.repeat(81), country: 'Россия', newsletterOptIn: true }, 'Имя'],
    [{ email: 'member@example.com', password: 'correct horse', name: 'Bad\nName', country: 'Россия', newsletterOptIn: true }, 'Имя'],
    [{ email: 'member@example.com', password: 'correct horse', country: 'x'.repeat(81), newsletterOptIn: true }, 'Страна'],
    [{ email: 'member@example.com', password: 'correct horse', country: '', newsletterOptIn: true }, 'страну'],
    [{ email: 'member@example.com', password: 'correct horse', country: 'Россия', newsletterOptIn: 'yes' }, 'согласия'],
    [{ email: 'member@example.com', password: 'correct horse', country: 'Россия', newsletterOptIn: false }, 'Подтвердите'],
  ];
  for (const [body, messagePart] of invalidRegistrationCases) {
    const response = await api('/auth/register', body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(String((await response.json() as any).error), new RegExp(messagePart, 'i'));
  }
  assert.equal(registerCalls.length, 0, 'invalid registration input must not reach persistence or mail delivery');

  const registered = await api('/auth/register', {
    email: ' MEMBER@EXAMPLE.COM ',
    password: 'correct horse',
    name: '  Участник  ',
    country: '  Россия ',
    newsletterOptIn: true,
  });
  assert.equal(registered.status, 200);
  assert.equal(registered.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(registerCalls, [{
    email: 'member@example.com',
    password: 'correct horse',
    name: 'Участник',
    country: 'Россия',
    newsletterOptIn: true,
  }]);

  registerResult = { ok: false, status: 409, error: 'Пользователь с такой почтой уже есть' };
  const conflict = await api('/auth/register', {
    email: 'member@example.com', password: 'correct horse', country: 'Россия', newsletterOptIn: true,
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: 'Пользователь с такой почтой уже есть' });

  const registerFailure = await api('/auth/register', {
    email: 'throw@example.com', password: 'correct horse', country: 'Россия', newsletterOptIn: true,
  });
  assert.equal(registerFailure.status, 503);
  assert.deepEqual(await registerFailure.json(), { error: 'Не удалось завершить регистрацию. Попробуйте позже' });

  const invalidLoginCases: Array<[unknown, string]> = [
    [[], 'Тело запроса'],
    [{ email: 'invalid', password: 'correct horse' }, 'почту'],
    [{ email: 'member@example.com', password: 12345678 }, 'Пароль'],
    [{ email: 'member@example.com', password: '' }, 'пароль'],
    [{ email: 'member@example.com', password: 'x'.repeat(129) }, 'пароль'],
  ];
  const loginCallsBeforeInvalid = loginCalls.length;
  for (const [body, messagePart] of invalidLoginCases) {
    const response = await api('/auth/login', body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(String((await response.json() as any).error), new RegExp(messagePart, 'i'));
  }
  assert.equal(loginCalls.length, loginCallsBeforeInvalid, 'invalid login input must not reach password verification');

  const loggedIn = await api('/auth/login', { email: ' MEMBER@EXAMPLE.COM ', password: 'correct horse' });
  assert.equal(loggedIn.status, 200);
  const loginPayload = await loggedIn.json() as any;
  assert.equal(loginPayload.authenticated, true);
  assert.equal('token' in loginPayload, false);
  assert.deepEqual(cookieTokens, ['cookie-only-session']);

  const loginFailure = await api('/auth/login', { email: 'throw@example.com', password: 'correct horse' });
  assert.equal(loginFailure.status, 503);
  assert.deepEqual(await loginFailure.json(), { error: 'Не удалось отправить код входа. Попробуйте позже' });
  assert.deepEqual(failures, ['register', 'login']);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

const successfulOrder: string[] = [];
await deliverCredentialCode(
  async () => { successfulOrder.push('delivered'); },
  () => { successfulOrder.push('persisted'); },
);
assert.deepEqual(successfulOrder, ['delivered', 'persisted']);

let persistedAfterFailure = false;
await assert.rejects(
  deliverCredentialCode(
    async () => { throw new Error('mail unavailable'); },
    () => { persistedAfterFailure = true; },
  ),
  /mail unavailable/,
);
assert.equal(persistedAfterFailure, false, 'failed delivery must not persist a partial account or unusable code');

console.log('auth credential validation and failure-boundary tests passed');
