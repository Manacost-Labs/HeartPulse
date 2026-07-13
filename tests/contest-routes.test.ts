import assert from 'node:assert/strict';
import express from 'express';
import { createContestRouter } from '../server/contestRoutes.js';

type Row = Record<string, unknown>;
const user = {
  id: 'user-1', email: 'winner@example.com', contactVkUrl: 'https://vk.com/winner',
  contactTelegram: 'winner_tg', contactEmail: 'contact@example.com',
};
let contest: Row | null = { id: 'contest-1', title: 'Розыгрыш', status: 'active', winners_json: '[]' };
let entry: Row = { status: 'approved', created_at: '2026-07-01T00:00:00.000Z' };
let history: Row[] = [{
  entry_id: 'entry-1', contest_id: 'contest-1', entry_status: 'approved', joined_at: '2026-07-01T00:00:00.000Z',
  title: 'Розыгрыш', prize: 'Приз', image_url: '/uploads/admin/prize.webp', contest_status: 'completed',
  starts_at: '2026-06-01T00:00:00.000Z', ends_at: '2026-07-01T00:00:00.000Z', winners_json: '["user-1"]',
}];
let storageFailure: 'all' | 'get' | 'run' | null = null;
let subscriptionMode: 'allowed' | 'denied' | 'failure' = 'allowed';
let writeParams: string[] = [];

const app = express();
app.use(express.json());
app.use('/api', createContestRouter({
  userAuth: request => request.headers['x-test-user'] === '1' ? user : null,
  repository: {
    all: (sql, ...params) => {
      if (storageFailure === 'all') throw new Error('/private/ecosystem.sqlite');
      if (sql.includes('FROM contest_entries e')) return history;
      if (sql.includes('FROM contest_entries WHERE user_id')) return [{ contest_id: 'contest-1', ...entry }];
      if (sql.includes('FROM contests WHERE status')) return contest ? [contest] : [];
      throw new Error(`unexpected SQL ${sql} ${params}`);
    },
    get: sql => {
      if (storageFailure === 'get') throw new Error('/private/ecosystem.sqlite');
      return sql.includes('SELECT * FROM contests') ? contest : entry;
    },
    run: (_sql, ...params) => {
      if (storageFailure === 'run') throw new Error('/private/ecosystem.sqlite');
      writeParams = params;
    },
  },
  serializeContest: (row, joined) => ({ id: String(row.id), title: String(row.title), entry: joined || null }),
  serializeUser: value => ({ id: value.id, email: value.email }),
  refreshSubscription: async () => {
    if (subscriptionMode === 'failure') throw new Error('secret upstream token');
    return { hasAccess: subscriptionMode === 'allowed', entitlements: { contests: subscriptionMode === 'allowed' } };
  },
  contestStatus: status => status,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  contestAdminUserId: 'contest-admin',
  isRealEmail: email => email.includes('@') && !email.endsWith('.local'),
  createEntryId: () => 'entry-created',
  now: () => new Date('2026-07-13T04:00:00.000Z'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const api = (path: string, options: RequestInit = {}, authenticated = false) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
  ...options,
  headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(authenticated ? { 'X-Test-User': '1' } : {}) },
});

try {
  const guestList = await api('/contests');
  assert.equal(guestList.status, 200);
  assert.deepEqual(await guestList.json(), { contests: [{ id: 'contest-1', title: 'Розыгрыш', entry: null }], user: null });

  const memberList = await api('/contests', {}, true);
  assert.equal(memberList.headers.get('cache-control'), 'private, no-store');
  const memberPayload = await memberList.json() as any;
  assert.equal(memberPayload.user.id, 'user-1');
  assert.equal(memberPayload.contests[0].entry.created_at, '2026-07-01T00:00:00.000Z');

  storageFailure = 'all';
  const listFailure = await api('/contests');
  assert.equal(listFailure.status, 500);
  assert.deepEqual(await listFailure.json(), { error: 'Не удалось загрузить конкурсы' });
  storageFailure = null;

  const loginRequired = await api('/contests/contest-1/join', { method: 'POST' });
  assert.equal(loginRequired.status, 401);
  assert.equal(loginRequired.headers.get('cache-control'), 'private, no-store');
  assert.equal((await api('/contests/bad%5Cid/join', { method: 'POST' }, true)).status, 400);

  contest = null;
  assert.equal((await api('/contests/missing/join', { method: 'POST' }, true)).status, 404);
  contest = { id: 'contest-1', title: 'Розыгрыш', status: 'draft' };
  assert.equal((await api('/contests/contest-1/join', { method: 'POST' }, true)).status, 404);
  contest = { id: 'contest-1', title: 'Розыгрыш', status: 'planned' };
  assert.equal((await api('/contests/contest-1/join', { method: 'POST' }, true)).status, 409);
  contest = { id: 'contest-1', title: 'Розыгрыш', status: 'completed' };
  assert.equal((await api('/contests/contest-1/join', { method: 'POST' }, true)).status, 409);
  contest = { id: 'contest-1', title: 'Розыгрыш', status: 'active' };

  subscriptionMode = 'failure';
  const upstreamFailure = await api('/contests/contest-1/join', { method: 'POST' }, true);
  assert.equal(upstreamFailure.status, 503);
  assert.deepEqual(await upstreamFailure.json(), { error: 'Не удалось проверить подписку. Попробуйте ещё раз.' });
  subscriptionMode = 'denied';
  assert.equal((await api('/contests/contest-1/join', { method: 'POST' }, true)).status, 403);

  subscriptionMode = 'allowed';
  const joined = await api('/contests/contest-1/join', { method: 'POST' }, true);
  assert.equal(joined.status, 200);
  assert.equal(joined.headers.get('cache-control'), 'private, no-store');
  const joinedPayload = await joined.json() as any;
  assert.equal(joinedPayload.entry.createdAt, '2026-07-01T00:00:00.000Z', 'repeat joins preserve the original entry date');
  assert.deepEqual(writeParams.slice(0, 4), ['entry-created', 'contest-1', 'user-1', 'winner@example.com']);
  assert.deepEqual(JSON.parse(writeParams[4]), {
    vk: 'https://vk.com/winner', telegram: 'winner_tg', email: 'contact@example.com',
  });

  storageFailure = 'run';
  const writeFailure = await api('/contests/contest-1/join', { method: 'POST' }, true);
  assert.equal(writeFailure.status, 500);
  assert.deepEqual(await writeFailure.json(), { error: 'Не удалось подать заявку на конкурс' });
  storageFailure = null;

  const historyLogin = await api('/profile/contest-history');
  assert.equal(historyLogin.status, 401);
  assert.equal(historyLogin.headers.get('cache-control'), 'private, no-store');
  const historyResponse = await api('/profile/contest-history', {}, true);
  assert.equal(historyResponse.status, 200);
  const historyPayload = await historyResponse.json() as any;
  assert.equal(historyPayload.entries[0].isWinner, true);
  assert.equal(historyPayload.entries[0].winners, undefined, 'raw winner IDs are not exposed');

  storageFailure = 'all';
  const historyFailure = await api('/profile/contest-history', {}, true);
  assert.equal(historyFailure.status, 500);
  assert.deepEqual(await historyFailure.json(), { error: 'Не удалось загрузить историю конкурсов' });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('public contest router contract tests passed');
