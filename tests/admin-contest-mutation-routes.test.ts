import assert from 'node:assert/strict';
import express from 'express';
import {
  createAdminContestMutationRouter,
  type AdminContestWrite,
} from '../server/adminContestMutationRoutes.js';

let contestExists = true;
let storageFailure: 'upsert' | 'winners' | 'delete' | 'lookup' | null = null;
let savedContest: AdminContestWrite | null = null;
let published: { contestId: string; winners: string[]; timestamp: string } | null = null;
let deletedId = '';
const approvedIds = ['user-1', 'user-2'];

const app = express();
app.use(express.json({ strict: false }));
app.use('/api', createAdminContestMutationRouter({
  adminAuth: request => request.headers['x-contest-admin'] === 'yes' ? { id: 'admin-1' } : null,
  normalizeDateTime: value => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  },
  normalizeImageUrl: value => {
    const raw = String(value ?? '').trim();
    return /^\/uploads\/admin\/[a-z0-9-]+\.webp$/i.test(raw) ? raw : '';
  },
  upsertContest: contest => {
    if (storageFailure === 'upsert') throw new Error('/private/ecosystem.sqlite');
    savedContest = structuredClone(contest);
    contestExists = true;
    return { ...contest, row: true };
  },
  getContest: contestId => {
    if (storageFailure === 'lookup') throw new Error('/private/ecosystem.sqlite');
    return contestExists && contestId === 'contest-1' ? { id: contestId } : null;
  },
  approvedWinnerIds: () => approvedIds,
  publishWinners: (contestId, winners, timestamp) => {
    if (storageFailure === 'winners') throw new Error('/private/ecosystem.sqlite');
    published = { contestId, winners: [...winners], timestamp };
    return { id: contestId, winners, status: 'completed' };
  },
  deleteContest: contestId => {
    if (storageFailure === 'delete') throw new Error('/private/ecosystem.sqlite');
    deletedId = contestId;
    contestExists = false;
  },
  serializeContest: (row, includeRawWinners) => ({ row, includeRawWinners: Boolean(includeRawWinners) }),
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  now: () => new Date('2026-07-13T01:15:00.000Z'),
  createId: () => 'contest-created',
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/admin/contests`;
const headers = { 'Content-Type': 'application/json', 'X-Contest-Admin': 'yes' };

async function request(path = '', method = 'POST', body?: unknown, authorized = true) {
  return fetch(`${base}${path}`, {
    method,
    headers: authorized ? headers : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

try {
  const forbidden = await request('', 'POST', { title: 'Forbidden' }, false);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');

  for (const body of [null, [], {}, { title: '   ' }]) {
    const invalid = await request('', 'POST', body);
    assert.equal(invalid.status, 400, `invalid contest accepted: ${JSON.stringify(body)}`);
  }

  for (const body of [
    { title: 'Bad start', startsAt: 'not-a-date' },
    { title: 'Bad end', endsAt: 'not-a-date' },
    { title: 'Bad order', startsAt: '2026-07-14T00:00:00Z', endsAt: '2026-07-13T00:00:00Z' },
    { title: 'Bad image', imageUrl: 'https://evil.example/image.webp' },
  ]) {
    const invalid = await request('', 'POST', body);
    assert.equal(invalid.status, 400, `invalid contest accepted: ${JSON.stringify(body)}`);
  }

  const created = await request('', 'POST', {
    title: `  ${'К'.repeat(180)}  `,
    description: ` ${'О'.repeat(2_050)} `,
    prize: '  Кубок  ',
    imageUrl: '/uploads/admin/cover.webp',
    startsAt: '2026-07-13T10:00:00Z',
    endsAt: '2026-07-14T10:00:00Z',
    status: 'planned',
  });
  assert.equal(created.status, 200);
  assert.equal(created.headers.get('cache-control'), 'private, no-store');
  assert.equal((await created.json() as { success: boolean }).success, true);
  assert.ok(savedContest);
  assert.equal(savedContest.id, 'contest-created');
  assert.equal(savedContest.title.length, 160);
  assert.equal(savedContest.description.length, 2_000);
  assert.equal(savedContest.prize, 'Кубок');
  assert.equal(savedContest.status, 'planned');
  assert.equal(savedContest.createdBy, 'admin-1');
  assert.equal(savedContest.timestamp, '2026-07-13T01:15:00.000Z');

  const fallbackStatus = await request('', 'POST', { id: 'contest-1', title: 'Update', status: 'unsafe' });
  assert.equal(fallbackStatus.status, 200);
  assert.equal(savedContest?.id, 'contest-1');
  assert.equal(savedContest?.status, 'active');

  storageFailure = 'upsert';
  const failedSave = await request('', 'POST', { title: 'Storage error' });
  assert.equal(failedSave.status, 500);
  assert.deepEqual(await failedSave.json(), { error: 'Не удалось сохранить конкурс' });
  storageFailure = null;

  contestExists = false;
  const missingContest = await request('/contest-1/winners', 'POST', { winners: ['user-1'] });
  assert.equal(missingContest.status, 404);
  contestExists = true;

  for (const winners of [undefined, null, [], [{}]]) {
    const invalid = await request('/contest-1/winners', 'POST', { winners });
    assert.equal(invalid.status, 400);
  }
  const invalidWinner = await request('/contest-1/winners', 'POST', { winners: ['user-3'] });
  assert.equal(invalidWinner.status, 400);

  const winnersSaved = await request('/contest-1/winners', 'POST', {
    winners: [' user-1 ', 'user-1', 'user-2'],
  });
  assert.equal(winnersSaved.status, 200);
  const winnersPayload = await winnersSaved.json() as { contest: { includeRawWinners: boolean } };
  assert.equal(winnersPayload.contest.includeRawWinners, true);
  assert.deepEqual(published, {
    contestId: 'contest-1',
    winners: ['user-1', 'user-2'],
    timestamp: '2026-07-13T01:15:00.000Z',
  });

  storageFailure = 'winners';
  const failedWinners = await request('/contest-1/winners', 'POST', { winners: ['user-1'] });
  assert.equal(failedWinners.status, 500);
  assert.deepEqual(await failedWinners.json(), { error: 'Не удалось сохранить победителей' });
  storageFailure = null;

  const missingDelete = await request('/missing', 'DELETE');
  assert.equal(missingDelete.status, 404);
  const deleted = await request('/contest-1', 'DELETE');
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { success: true, deletedId: 'contest-1' });
  assert.equal(deletedId, 'contest-1');

  contestExists = true;
  storageFailure = 'delete';
  const failedDelete = await request('/contest-1', 'DELETE');
  assert.equal(failedDelete.status, 500);
  assert.deepEqual(await failedDelete.json(), { error: 'Не удалось удалить конкурс' });
  storageFailure = null;

  storageFailure = 'lookup';
  const failedLookup = await request('/contest-1', 'DELETE');
  assert.equal(failedLookup.status, 500);
  assert.deepEqual(await failedLookup.json(), { error: 'Не удалось удалить конкурс' });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin contest mutation router contract tests passed');
