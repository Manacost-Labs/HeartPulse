import assert from 'node:assert/strict';
import express from 'express';
import { createAdminUserReadRouter } from '../server/adminUserReadRoutes.js';

let failure = false;
let lastAll: { sql: string; params: unknown[] } | null = null;
const app = express();
app.use('/api', createAdminUserReadRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  repository: {
    get: sql => {
      if (failure) throw new Error('/private/ecosystem.sqlite');
      assert.match(sql, /COUNT/);
      return { count: 1 };
    },
    all: (sql, ...params) => {
      if (failure) throw new Error('/private/ecosystem.sqlite');
      lastAll = { sql, params };
      return [{
        id: 'user-1',
        email: 'user@example.test',
        manual_access: 1,
        manual_access_expires_at: '2026-08-01T00:00:00.000Z',
      }];
    },
  },
  subscriptionForUser: (_row, manualAccess) => ({ hasAccess: manualAccess.enabled }),
  subscriptionForSearchUser: () => ({ hasAccess: false }),
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/admin/users`;
const get = (path = '', admin = true) => fetch(`${base}${path}`, { headers: admin ? { 'X-Admin': 'yes' } : {} });

try {
  const forbidden = await get('', false);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');

  const emptySearch = await get('/search?q=');
  assert.deepEqual(await emptySearch.json(), { users: [] });
  assert.equal(lastAll, null);

  const search = await get('/search?q=%20TeSt%20');
  assert.equal(search.status, 200);
  const searchPayload = await search.json() as { users: Array<{ id: string; subscription: { hasAccess: boolean } }> };
  assert.equal(searchPayload.users[0].id, 'user-1');
  assert.equal(searchPayload.users[0].subscription.hasAccess, false);
  assert.ok(lastAll);
  assert.equal(lastAll.params.length, 7);
  assert.deepEqual(lastAll.params, Array(7).fill('%test%'));
  assert.match(lastAll.sql, /LIMIT 40/);

  for (const query of ['?role=owner', '?subscription=expired']) {
    const invalid = await get(query);
    assert.equal(invalid.status, 400);
  }

  const list = await get('?q=USER&role=admin&subscription=active&limit=25.9&offset=3.8');
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('cache-control'), 'private, no-store');
  const listPayload = await list.json() as {
    users: Array<{
      id: string;
      manualAccess: { enabled: boolean; expiresAt: string | null };
      lifetimeAccess: boolean;
      subscription: { hasAccess: boolean };
    }>;
    total: number;
    limit: number;
    offset: number;
  };
  assert.equal(listPayload.users[0].id, 'user-1');
  assert.equal(listPayload.users[0].subscription.hasAccess, true);
  assert.deepEqual(listPayload.users[0].manualAccess, {
    enabled: true,
    expiresAt: '2026-08-01T00:00:00.000Z',
  });
  assert.equal(listPayload.users[0].lifetimeAccess, false);
  assert.deepEqual({ total: listPayload.total, limit: listPayload.limit, offset: listPayload.offset }, { total: 1, limit: 25, offset: 3 });
  assert.ok(lastAll);
  assert.equal(lastAll.params.at(-2), 25);
  assert.equal(lastAll.params.at(-1), 3);
  assert.ok(lastAll.params.includes('%user%'));
  assert.ok(lastAll.params.includes('admin'));
  assert.match(lastAll.sql, /g\.expires_at/);

  const clamped = await get('?limit=9999&offset=-5');
  assert.equal(clamped.status, 200);
  const clampedPayload = await clamped.json() as { total: number; limit: number; offset: number };
  assert.deepEqual({ total: clampedPayload.total, limit: clampedPayload.limit, offset: clampedPayload.offset }, { total: 1, limit: 200, offset: 0 });

  failure = true;
  const failedList = await get('');
  assert.equal(failedList.status, 500);
  assert.deepEqual(await failedList.json(), { error: 'Не удалось загрузить пользователей' });
  const failedSearch = await get('/search?q=user');
  assert.equal(failedSearch.status, 500);
  assert.deepEqual(await failedSearch.json(), { error: 'Не удалось найти пользователей' });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin user read router contract tests passed');
