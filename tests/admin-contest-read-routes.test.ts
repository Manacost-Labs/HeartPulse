import assert from 'node:assert/strict';
import express from 'express';
import { createAdminContestReadRouter } from '../server/adminContestReadRoutes.js';

let failure: 'contests' | 'entries' | null = null;
let lastQuery: { sql: string; params: string[] } | null = null;
const app = express();
app.use('/api', createAdminContestReadRouter({
  adminAuth: request => request.headers['x-contest-admin'] === 'yes' ? { id: 'admin-1', email: 'admin@example.test' } : null,
  repository: {
    all: (sql, ...params) => {
      lastQuery = { sql, params };
      if (!params.length) {
        if (failure === 'contests') throw new Error('/private/ecosystem.sqlite');
        return [{ id: 'contest-1', title: 'Contest', entries_count: 2 }];
      }
      if (failure === 'entries') throw new Error('/private/ecosystem.sqlite');
      return [{
        id: 'entry-1', contest_id: params[0], user_id: 'user-1', name: 'Участник', email: 'entry@example.test', status: 'approved',
        created_at: '2026-07-13T03:00:00.000Z', contact_json: '{"telegram":"@entry"}', subscription_json: '{"hasAccess":true}',
        contact_vk_url: 'vk.com/entry', contact_telegram: '', telegram_username: 'entry_user', contact_email: 'contact@example.test',
      }];
    },
  },
  serializeContest: row => ({ id: row.id, title: row.title, rawWinners: true }),
  serializeAdmin: admin => ({ id: (admin as { id: string }).id }),
  safeJsonObject: value => {
    try { const parsed = JSON.parse(String(value || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
  },
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/admin/contests`;
const request = (path = '', authorized = true) => fetch(`${base}${path}`, { headers: authorized ? { 'X-Contest-Admin': 'yes' } : {} });

try {
  for (const path of ['', '/contest-1/entries']) {
    const forbidden = await request(path, false);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');
  }

  const contests = await request();
  assert.equal(contests.status, 200);
  assert.equal(contests.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await contests.json(), {
    contests: [{ id: 'contest-1', title: 'Contest', rawWinners: true, entriesCount: 2 }],
    admin: { id: 'admin-1' },
  });
  assert.ok(lastQuery);
  assert.match(lastQuery.sql, /COUNT\(e\.id\)/);

  const entries = await request('/contest-1/entries');
  assert.equal(entries.status, 200);
  assert.ok(lastQuery);
  assert.deepEqual(lastQuery.params, ['contest-1']);
  assert.match(lastQuery.sql, /WHERE e\.contest_id = \?/);
  assert.deepEqual(await entries.json(), { entries: [{
    id: 'entry-1', contestId: 'contest-1', userId: 'user-1', profileId: 'user-1', name: 'Участник',
    email: 'entry@example.test', status: 'approved', createdAt: '2026-07-13T03:00:00.000Z',
    contact: { telegram: '@entry' }, subscription: { hasAccess: true },
    profileContacts: { vk: 'vk.com/entry', telegram: 'entry_user', email: 'contact@example.test' },
  }] });

  for (const id of [`/${'a'.repeat(121)}/entries`, '/bad%2Fid/entries']) {
    const invalid = await request(id);
    assert.equal(invalid.status, 400);
  }

  failure = 'contests';
  const failedContests = await request();
  assert.equal(failedContests.status, 500);
  assert.deepEqual(await failedContests.json(), { error: 'Не удалось загрузить конкурсы' });
  failure = 'entries';
  const failedEntries = await request('/contest-1/entries');
  assert.equal(failedEntries.status, 500);
  const failedEntriesPayload = await failedEntries.json();
  assert.deepEqual(failedEntriesPayload, { error: 'Не удалось загрузить заявки конкурса' });
  assert.doesNotMatch(JSON.stringify(failedEntriesPayload), /private|sqlite/i);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin contest read router contract tests passed');
