import assert from 'node:assert/strict';
import express from 'express';
import { createEcosystemInternalRouter } from '../server/modules/ecosystem/public.js';
import {
  requestLoggingMiddleware,
  structuredErrorMiddleware,
} from '../server/observability.js';

type TestUser = {
  id: string;
  name: string;
};

type TestSubscription = {
  hasAccess: boolean;
  source: string;
};

const users = new Map<string, TestUser>([
  ['stored-user', { id: 'stored-user', name: 'Stored User' }],
  ['empty-user', { id: 'empty-user', name: 'Empty User' }],
  ['error-user', { id: 'error-user', name: 'Error User' }],
]);
const storedSubscriptions = new Map<string, TestSubscription>([
  ['stored-user', { hasAccess: true, source: 'stored' }],
]);
const refreshCalls: Array<{ userId: string; force: boolean }> = [];
const structuredLogLines: string[] = [];
const responseFinishCounts = new Map<string, number>();
const unhandledRejections: unknown[] = [];
const recordUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
process.on('unhandledRejection', recordUnhandledRejection);

const app = express();
app.use(requestLoggingMiddleware(line => structuredLogLines.push(line)));
app.use((request, response, next) => {
  const requestId = String(request.headers['x-request-id'] ?? '');
  response.once('finish', () => {
    responseFinishCounts.set(requestId, (responseFinishCounts.get(requestId) ?? 0) + 1);
  });
  next();
});
app.use('/api', createEcosystemInternalRouter({
  internalGuard: (request, response, next) => {
    if (request.headers['x-ecosystem-key'] !== 'test-internal-key') {
      return response.status(401).json({ error: 'Invalid ecosystem key' });
    }
    next();
  },
  resolveUser: request => users.get(String(request.query.userId ?? '')) ?? null,
  serializeUser: user => ({ id: user.id, name: user.name }),
  readSubscription: userId => storedSubscriptions.get(userId) ?? null,
  emptySubscription: () => ({ hasAccess: false, source: 'none' }),
  refreshSubscription: async (user, force) => {
    refreshCalls.push({ userId: user.id, force });
    if (user.id === 'error-user') {
      throw Object.assign(new Error('private subscription refresh detail'), {
        code: 'SUBSCRIPTION_REFRESH_FAILED',
      });
    }
    return { hasAccess: true, source: force ? 'forced-refresh' : 'refresh' };
  },
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
app.use(structuredErrorMiddleware(line => structuredLogLines.push(line)));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');

const api = (path: string, options: RequestInit = {}) => fetch(
  `http://127.0.0.1:${address.port}/api${path}`,
  {
    ...options,
    headers: {
      'X-Ecosystem-Key': 'test-internal-key',
      ...options.headers,
    },
  },
);

try {
  for (const [path, method] of [
    ['/ecosystem/internal/user?userId=stored-user', 'GET'],
    ['/ecosystem/internal/subscription?userId=stored-user', 'GET'],
    ['/ecosystem/internal/subscription?userId=stored-user', 'POST'],
  ] as const) {
    const denied = await api(path, {
      method,
      headers: { 'X-Ecosystem-Key': 'wrong-key' },
    });
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'Invalid ecosystem key' });
  }
  assert.deepEqual(refreshCalls, []);

  const missing = await api('/ecosystem/internal/user?userId=missing-user');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await missing.json(), { error: 'User not found' });

  const stored = await api('/ecosystem/internal/user?userId=stored-user');
  assert.equal(stored.status, 200);
  assert.equal(stored.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await stored.json(), {
    user: { id: 'stored-user', name: 'Stored User' },
    subscription: { hasAccess: true, source: 'stored' },
  });

  const empty = await api('/ecosystem/internal/user?userId=empty-user');
  assert.deepEqual(await empty.json(), {
    user: { id: 'empty-user', name: 'Empty User' },
    subscription: { hasAccess: false, source: 'none' },
  });

  const refreshed = await api('/ecosystem/internal/subscription?userId=stored-user');
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await refreshed.json(), {
    user: { id: 'stored-user', name: 'Stored User' },
    subscription: { hasAccess: true, source: 'refresh' },
  });

  const forced = await api('/ecosystem/internal/subscription?userId=stored-user&force=1');
  assert.equal(forced.status, 200);
  assert.deepEqual(await forced.json(), {
    user: { id: 'stored-user', name: 'Stored User' },
    subscription: { hasAccess: true, source: 'forced-refresh' },
  });

  const textualForce = await api('/ecosystem/internal/subscription?userId=stored-user&force=true');
  assert.equal(textualForce.status, 200);

  const posted = await api('/ecosystem/internal/subscription?userId=stored-user', { method: 'POST' });
  assert.equal(posted.status, 200);

  for (const method of ['GET', 'POST'] as const) {
    const requestId = `ecosystem-error-${method.toLowerCase()}`;
    const rejected = await api('/ecosystem/internal/subscription?userId=error-user', {
      method,
      headers: { 'X-Request-ID': requestId },
      signal: AbortSignal.timeout(1_000),
    });
    assert.equal(rejected.status, 500);
    assert.equal(rejected.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await rejected.json(), {
      error: 'Внутренняя ошибка сервера',
      requestId,
    });
    assert.equal(responseFinishCounts.get(requestId), 1, 'the rejected handler must finish exactly one response');
  }

  await new Promise(resolve => setImmediate(resolve));
  const errorRecords = structuredLogLines
    .map(line => JSON.parse(line))
    .filter(record => record.event === 'http_request_error');
  assert.deepEqual(errorRecords.map(record => ({
    requestId: record.requestId,
    status: record.status,
    errorCode: record.errorCode,
  })), [
    {
      requestId: 'ecosystem-error-get',
      status: 500,
      errorCode: 'SUBSCRIPTION_REFRESH_FAILED',
    },
    {
      requestId: 'ecosystem-error-post',
      status: 500,
      errorCode: 'SUBSCRIPTION_REFRESH_FAILED',
    },
  ]);
  assert.deepEqual(unhandledRejections, []);
  assert.doesNotMatch(structuredLogLines.join('\n'), /private subscription refresh detail/);
  assert.deepEqual(refreshCalls, [
    { userId: 'stored-user', force: false },
    { userId: 'stored-user', force: true },
    { userId: 'stored-user', force: false },
    { userId: 'stored-user', force: true },
    { userId: 'error-user', force: false },
    { userId: 'error-user', force: true },
  ]);
} finally {
  process.off('unhandledRejection', recordUnhandledRejection);
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('ecosystem internal router contract tests passed');
