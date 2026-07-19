import assert from 'node:assert/strict';
import express from 'express';
import {
  AdminUserMutationError,
  createAdminUserMutationRouter,
  mutateAdminUser,
  type AdminUserMutationAudit,
  type AdminUserMutationChanges,
  type AdminUserManualAccess,
  type AdminUserMutationStore,
  type AdminUserMutationUser,
} from '../server/adminUserMutationRoutes.js';

type MemoryState = {
  users: AdminUserMutationUser[];
  sessions: Array<{ userId: string; email: string }>;
  manualAccess: Map<string, AdminUserManualAccess>;
  audits: Array<{ actorId: string; userId: string; details: AdminUserMutationAudit }>;
};

const initialState = (): MemoryState => ({
  users: [
    { id: 'admin-1', email: 'admin@example.test', role: 'admin', blockedAt: '', updatedAt: 'old' },
    { id: 'admin-2', email: 'second-admin@example.test', role: 'admin', blockedAt: '', updatedAt: 'old' },
    { id: 'user-1', email: 'user@example.test', role: 'user', blockedAt: '', updatedAt: 'old' },
  ],
  sessions: [
    { userId: 'user-1', email: 'user@example.test' },
    { userId: 'admin-1', email: 'admin@example.test' },
  ],
  manualAccess: new Map(),
  audits: [],
});

let state = initialState();
let failLifetime = false;

function cloneState(value: MemoryState): MemoryState {
  return {
    users: structuredClone(value.users),
    sessions: structuredClone(value.sessions),
    manualAccess: new Map([...value.manualAccess].map(([key, grant]) => [key, structuredClone(grant)])),
    audits: structuredClone(value.audits),
  };
}

const store: AdminUserMutationStore = {
  transaction: work => {
    const before = cloneState(state);
    try {
      return work();
    } catch (error) {
      state = before;
      throw error;
    }
  },
  listUsers: () => state.users,
  getManualAccess: userId => state.manualAccess.get(userId) ?? { enabled: false, expiresAt: null },
  updateUser: (userId, values) => {
    const user = state.users.find(item => item.id === userId);
    if (!user) throw new Error('missing user');
    Object.assign(user, values);
  },
  deleteUserSessions: (userId, email) => {
    state.sessions = state.sessions.filter(session => session.userId !== userId && session.email !== email);
  },
  setManualAccess: (userId, grant) => {
    if (failLifetime) throw new Error('/private/ecosystem.sqlite');
    state.manualAccess.set(userId, structuredClone(grant));
  },
  recordAudit: (actorId, userId, details) => {
    state.audits.push({ actorId, userId, details: structuredClone(details) });
  },
};

function mutate(actorId: string, userId: string, changes: AdminUserMutationChanges) {
  const outcome = mutateAdminUser(store, actorId, userId, changes, '2026-07-13T02:00:00.000Z');
  return { success: true, user: outcome.user, manualAccess: outcome.manualAccess, lifetimeAccess: outcome.lifetimeAccess };
}

const app = express();
app.use(express.json({ strict: false }));
app.use('/api', createAdminUserMutationRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: String(request.headers['x-admin-id'] || 'admin-1') } : null,
  csrfAllowed: request => request.headers['x-csrf-request'] === '1',
  mutateUser: mutate,
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/admin/users`;

async function request(userId: string, body: unknown, options: { authorized?: boolean; csrf?: boolean; actorId?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.authorized !== false) headers['X-Admin'] = 'yes';
  if (options.csrf !== false) headers['X-CSRF-Request'] = '1';
  if (options.actorId) headers['X-Admin-Id'] = options.actorId;
  return fetch(`${base}/${userId}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
}

try {
  const forbidden = await request('user-1', { blocked: true }, { authorized: false });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');

  const csrfRejected = await request('user-1', { blocked: true }, { csrf: false });
  assert.equal(csrfRejected.status, 403);
  assert.deepEqual(await csrfRejected.json(), { error: 'Запрос отклонён: обновите страницу и повторите действие' });

  for (const body of [
    null,
    [],
    {},
    { role: 'owner' },
    { blocked: 'yes' },
    { manualAccess: true },
    { manualAccess: { enabled: 'yes', expiresAt: null } },
    { manualAccess: { enabled: true, expiresAt: 'not-a-date' } },
    { lifetimeAccess: true, manualAccess: { enabled: true, expiresAt: null } },
  ]) {
    const invalid = await request('user-1', body);
    assert.equal(invalid.status, 400, `invalid user mutation accepted: ${JSON.stringify(body)}`);
  }
  assert.equal((await request('missing', { role: 'user' })).status, 404);
  assert.equal((await request('admin-1', { blocked: true })).status, 400);
  assert.equal((await request('admin-1', { role: 'user' })).status, 400);

  state = initialState();
  state.users = state.users.filter(user => user.id !== 'admin-2');
  const lastAdmin = await request('admin-1', { blocked: true }, { actorId: 'external-admin' });
  assert.equal(lastAdmin.status, 400);
  assert.deepEqual(await lastAdmin.json(), { error: 'Нельзя оставить сайт без активного администратора' });

  state = initialState();
  const temporaryExpiry = '2026-08-13T02:00:00.000Z';
  const updated = await request('user-1', {
    role: 'admin',
    blocked: true,
    manualAccess: { enabled: true, expiresAt: temporaryExpiry },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.headers.get('cache-control'), 'private, no-store');
  const updatedPayload = await updated.json() as {
    success: boolean;
    user: AdminUserMutationUser;
    manualAccess: AdminUserManualAccess;
    lifetimeAccess: boolean;
  };
  assert.equal(updatedPayload.success, true);
  assert.equal(updatedPayload.user.role, 'admin');
  assert.ok(updatedPayload.user.blockedAt);
  assert.deepEqual(updatedPayload.manualAccess, { enabled: true, expiresAt: temporaryExpiry });
  assert.equal(updatedPayload.lifetimeAccess, false);
  assert.equal(state.sessions.some(session => session.userId === 'user-1'), false);
  assert.deepEqual(state.manualAccess.get('user-1'), { enabled: true, expiresAt: temporaryExpiry });
  assert.deepEqual(state.audits.at(-1), {
    actorId: 'admin-1',
    userId: 'user-1',
    details: {
      role: { from: 'user', to: 'admin' },
      blocked: { from: false, to: true },
      manualAccess: {
        from: { enabled: false, expiresAt: null },
        to: { enabled: true, expiresAt: temporaryExpiry },
      },
    },
  });

  const forever = await request('user-1', { manualAccess: { enabled: true, expiresAt: null } });
  assert.equal(forever.status, 200);
  const foreverPayload = await forever.json() as { manualAccess: AdminUserManualAccess; lifetimeAccess: boolean };
  assert.deepEqual(foreverPayload.manualAccess, { enabled: true, expiresAt: null });
  assert.equal(foreverPayload.lifetimeAccess, true);

  const unblocked = await request('user-1', { blocked: false, manualAccess: { enabled: false, expiresAt: null } });
  assert.equal(unblocked.status, 200);
  assert.equal(state.users.find(user => user.id === 'user-1')?.blockedAt, '');
  assert.deepEqual(state.manualAccess.get('user-1'), { enabled: false, expiresAt: null });

  const expired = await request('user-1', { manualAccess: { enabled: true, expiresAt: '2026-07-13T01:59:59.000Z' } });
  assert.equal(expired.status, 400);
  assert.deepEqual(await expired.json(), { error: 'Срок полного доступа должен быть в будущем' });

  state = initialState();
  const beforeFailure = cloneState(state);
  failLifetime = true;
  const failed = await request('user-1', { role: 'admin', blocked: true, manualAccess: { enabled: true, expiresAt: null } });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Не удалось обновить пользователя' });
  assert.deepEqual(state, beforeFailure, 'combined mutation was not fully rolled back');
  failLifetime = false;

  assert.throws(
    () => mutateAdminUser(store, 'admin-1', 'missing', { role: 'user' }, '2026-07-13T02:00:00.000Z'),
    (error: unknown) => error instanceof AdminUserMutationError && error.status === 404,
  );
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin user mutation router and transaction contract tests passed');
