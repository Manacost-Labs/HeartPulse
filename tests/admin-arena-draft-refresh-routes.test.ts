import assert from 'node:assert/strict';
import express from 'express';
import type {
  ArenaDraftRefreshPipeline,
  ArenaDraftRefreshRun,
} from '../server/arenaDraftRefreshPipeline.js';
import { createAdminArenaSynergyRouter } from '../server/adminArenaSynergyRoutes.js';

let csrfAllowed = false;
let runCalls = 0;
let runFails = false;
let reportedError: unknown;
const completedRun: ArenaDraftRefreshRun = {
  id: 'refresh-1',
  trigger: 'manual',
  status: 'succeeded',
  startedAt: '2026-07-30T10:00:00.000Z',
  finishedAt: '2026-07-30T10:00:02.000Z',
  durationMs: 2_000,
  cohortId: 'arena-2026-07-30',
  patchVersion: '36.0',
  sourceRows: 500,
  qualityScore: 97,
  publishedClasses: ['ALL', 'MAGE'],
  errorCode: null,
};
const refreshPipeline: ArenaDraftRefreshPipeline = {
  status: () => ({
    schemaVersion: 1,
    updatedAt: completedRun.finishedAt!,
    schedule: '17 * * * *',
    isRunning: false,
    lastAttemptAt: completedRun.startedAt,
    lastSuccessAt: completedRun.finishedAt,
    runs: [completedRun],
  }),
  run: async trigger => {
    runCalls += 1;
    assert.equal(trigger, 'manual');
    if (runFails) throw new Error('private upstream path and token');
    return { run: completedRun, deduplicated: false };
  },
};

const app = express();
app.use(express.json());
app.use('/api', createAdminArenaSynergyRouter({
  adminGuard: (request, response, next) => (
    request.headers['x-test-admin'] === '1'
      ? next()
      : response.status(401).json({ error: 'Требуется вход' })
  ),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  csrfAllowed: () => csrfAllowed,
  loadAnalysis: async () => ({}),
  refreshPipeline,
  onError: error => { reportedError = error; },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/admin/arena-draft-refresh`;

try {
  assert.equal((await fetch(endpoint)).status, 401);
  assert.equal(runCalls, 0);

  const statusResponse = await fetch(endpoint, {
    headers: { 'X-Test-Admin': '1' },
  });
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal((await statusResponse.json() as any).lastSuccessAt, completedRun.finishedAt);

  const rejected = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-Test-Admin': '1' },
  });
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json() as any).code, 'CSRF_REJECTED');
  assert.equal(runCalls, 0);

  csrfAllowed = true;
  const started = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-Test-Admin': '1' },
  });
  assert.equal(started.status, 200);
  const result = await started.json() as any;
  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.run.sourceRows, 500);
  assert.equal(result.deduplicated, false);
  assert.equal(runCalls, 1);

  runFails = true;
  const failed = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-Test-Admin': '1' },
  });
  assert.equal(failed.status, 502);
  const failure = await failed.json() as any;
  assert.equal(failure.code, 'ARENA_DRAFT_REFRESH_UNAVAILABLE');
  assert.equal(JSON.stringify(failure).includes('private upstream path'), false);
  assert.ok(reportedError instanceof Error);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin arena draft refresh routes tests passed');
