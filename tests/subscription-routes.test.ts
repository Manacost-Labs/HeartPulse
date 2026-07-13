import assert from 'node:assert/strict';
import express from 'express';
import { createSubscriptionRouter } from '../server/subscriptionRoutes.js';

let fail = false;
const forceCalls: boolean[] = [];
const fallback = (message: string) => ({
  hasAccess: false, source: 'none', checkedAt: null, stale: true, message,
  entitlements: { contests: false }, boosty: {}, telegram: {},
});
const app = express();
app.use('/api', createSubscriptionRouter({
  userAuth: request => request.headers['x-test-user'] === '1' ? { id: 'user-1' } : null,
  refreshSubscription: async (_user, force) => {
    forceCalls.push(force);
    if (fail) throw new Error('secret upstream response and token');
    return {
      hasAccess: true, source: 'boosty', checkedAt: '2026-07-13T04:00:00.000Z', stale: false,
      message: 'Подписка активна', entitlements: { contests: true }, boosty: {}, telegram: {},
    };
  },
  unavailableStatus: fallback,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const api = (path: string, method = 'GET', authenticated = true) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
  method,
  headers: authenticated ? { 'X-Test-User': '1' } : {},
});

try {
  for (const [path, method] of [['/subscription/status', 'GET'], ['/subscription/refresh', 'POST']]) {
    const denied = await api(path, method, false);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  }

  const status = await api('/subscription/status');
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('cache-control'), 'private, no-store');
  assert.equal((await status.json() as any).hasAccess, true);
  const refresh = await api('/subscription/refresh', 'POST');
  assert.equal(refresh.status, 200);
  assert.deepEqual(forceCalls, [false, true]);

  fail = true;
  const unavailable = await api('/subscription/status');
  assert.equal(unavailable.status, 503);
  const unavailablePayload = await unavailable.json() as any;
  assert.deepEqual(unavailablePayload, fallback('Не удалось проверить подписку. Попробуйте ещё раз.'));
  assert.equal(JSON.stringify(unavailablePayload).includes('secret upstream'), false);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('subscription router contract tests passed');
