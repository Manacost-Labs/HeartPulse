import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createAuthVerificationRouter } from '../server/authVerificationRoutes.js';

type User = { id: string; email: string; role: 'user' | 'admin' };
const user: User = { id: 'user-1', email: 'member@example.com', role: 'user' };
let mode: 'success' | 'invalid' | 'blocked' | 'failure' = 'invalid';
let cookieTokens: string[] = [];

const app = express();
app.use(express.json());
app.use('/api', createAuthVerificationRouter({
  normalizeEmail: value => String(value ?? '').trim().toLowerCase(),
  isRealEmail: email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  verify: () => {
    if (mode === 'failure') throw new Error('database path and secret token');
    if (mode === 'blocked') return { ok: false as const, status: 403, error: 'Доступ запрещён' };
    if (mode === 'invalid') return { ok: false as const, status: 401, error: 'Неверный или устаревший код' };
    return { ok: true as const, user, sessionToken: 'server-session-secret' };
  },
  setAuthCookie: (_request, _response, token) => { cookieTokens.push(token); },
  serializeUser: value => ({ ...value }),
  isAdmin: value => value.role === 'admin',
  isContestAdmin: () => false,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const api = (body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/auth/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

try {
  const invalidCases: Array<[unknown, string]> = [
    [[], 'Тело запроса'],
    [{ email: 'invalid', code: '123456' }, 'почту'],
    [{ email: 'x'.repeat(255), code: '123456' }, 'почту'],
    [{ email: 'member@example.com', code: '12a456' }, 'шестизначный'],
    [{ email: 'member@example.com', code: 123456 }, 'шестизначный'],
  ];
  for (const [body, messagePart] of invalidCases) {
    const response = await api(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(String((await response.json() as any).error), new RegExp(messagePart, 'i'));
  }

  mode = 'invalid';
  const invalid = await api({ email: 'member@example.com', code: '123456' });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await invalid.json(), { error: 'Неверный или устаревший код' });

  mode = 'blocked';
  const blocked = await api({ email: 'member@example.com', code: '123456' });
  assert.equal(blocked.status, 403);
  assert.deepEqual(await blocked.json(), { error: 'Доступ запрещён' });

  mode = 'failure';
  const failure = await api({ email: 'member@example.com', code: '123456' });
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: 'Не удалось подтвердить вход' });

  mode = 'success';
  const success = await api({ email: 'member@example.com', code: '123456' });
  assert.equal(success.status, 200);
  assert.deepEqual(cookieTokens, ['server-session-secret']);
  const payload = await success.json() as any;
  assert.equal(payload.success, true);
  assert.equal(payload.user.email, user.email);
  assert.equal(payload.adminAllowed, false);
  assert.equal('token' in payload, false, 'session token must only be delivered via an httpOnly cookie');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

const browserSources = [
  readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8'),
].join('\n');
assert.doesNotMatch(browserSources, /setAuthToken\s*\(/, 'browser must not retain a session bearer token');
assert.doesNotMatch(browserSources, /Authorization:\s*`Bearer/, 'same-origin browser API calls must use the httpOnly cookie');
assert.doesNotMatch(browserSources, /sessionStorage\.getItem\([^)]*auth_token/i, 'legacy browser tokens must not be read');

const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
assert.doesNotMatch(
  serverSource,
  /res\.json\(\{\s*success:\s*true,\s*token,\s*user:/,
  'authentication responses must not expose raw session tokens',
);

console.log('auth verification httpOnly-session contract tests passed');
