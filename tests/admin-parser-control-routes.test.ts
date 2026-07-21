import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createAdminParserControlRouter,
  type AdminParserControlClient,
} from '../server/adminParserControlRoutes.js';

const calls: Array<{ action: string; payload?: unknown }> = [];
const invalidations: Array<{ reason: 'policy-change' | 'manual-run'; runId?: string }> = [];
const client: AdminParserControlClient = {
  configured: true,
  getControl: async () => ({ revision: 4, policy: { mode: 'stable' }, sections: [] }),
  updatePolicy: async payload => {
    calls.push({ action: 'policy', payload });
    return { revision: 5, policy: { mode: payload.mode }, sections: [] };
  },
  updateSections: async payload => {
    calls.push({ action: 'sections', payload });
    return { revision: 6, policy: { mode: 'stable' }, sections: [] };
  },
  createRun: async payload => {
    calls.push({ action: 'run', payload });
    return { id: 'run-1', status: 'succeeded' };
  },
  listRuns: async () => ({ runs: [{ id: 'run-1', status: 'queued' }] }),
};

const audits: Array<{ action: string; entityId: string; details?: Record<string, unknown> }> = [];
const adminGuard: RequestHandler = (request, response, next) => request.headers['x-admin'] === 'yes'
  ? next()
  : response.status(403).end();
const app = express();
app.use(express.json());
app.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  client,
  invalidateParserDataCaches: async context => {
    invalidations.push(context);
  },
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  recordAudit: (_actor, action, entityId, details) => audits.push({ action, entityId, details }),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const url = `http://127.0.0.1:${address.port}/api/admin/parser-control`;

try {
  assert.equal((await fetch(url)).status, 403, 'all parser controls stay behind full-admin guard');

  const status = await fetch(url, { headers: { 'X-Admin': 'yes' } });
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await status.json(), { revision: 4, policy: { mode: 'stable' }, sections: [] });

  const invalidPolicy = await fetch(`${url}/policy`, {
    method: 'PATCH',
    headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'instant', expectedRevision: 4 }),
  });
  assert.equal(invalidPolicy.status, 400);

  const invalidRevision = await fetch(`${url}/policy`, {
    method: 'PATCH',
    headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'stable', expectedRevision: 0 }),
  });
  assert.equal(invalidRevision.status, 400);

  const earlyPolicy = await fetch(`${url}/policy`, {
    method: 'PATCH',
    headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'early',
      earlyUntil: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
      reason: 'Балансный патч',
      expectedRevision: 4,
    }),
  });
  assert.equal(earlyPolicy.status, 200);
  assert.deepEqual((await earlyPolicy.json() as { warnings?: unknown }).warnings, undefined);
  assert.deepEqual(invalidations, [{ reason: 'policy-change' }]);

  const invalidSections = await fetch(`${url}/sections`, {
    method: 'PATCH',
    headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections: { '../../../etc/passwd': true }, expectedRevision: 5 }),
  });
  assert.equal(invalidSections.status, 400);

  const sections = await fetch(`${url}/sections`, {
    method: 'PATCH',
    headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections: { arena: true, battlegrounds: false }, expectedRevision: 5 }),
  });
  assert.equal(sections.status, 200);

  const invalidRun = await fetch(`${url}/runs`, {
    method: 'POST',
    headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectionIds: [] }),
  });
  assert.equal(invalidRun.status, 400);

  const run = await fetch(`${url}/runs`, {
    method: 'POST',
    headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectionIds: ['arena'], sourceIds: ['hsreplay_arena'], reason: 'Ручная проверка' }),
  });
  assert.equal(run.status, 202);
  assert.deepEqual(await run.json(), { id: 'run-1', status: 'succeeded' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(invalidations, [
    { reason: 'policy-change' },
    { reason: 'manual-run', runId: 'run-1' },
  ]);

  const runs = await fetch(`${url}/runs`, { headers: { 'X-Admin': 'yes' } });
  assert.equal(runs.status, 200);
  assert.deepEqual(await runs.json(), { runs: [{ id: 'run-1', status: 'queued' }] });

  assert.equal(calls.length, 3);
  assert.deepEqual(audits.map(item => item.action), [
    'parser-control.policy.update',
    'parser-control.sections.update',
    'parser-control.run.create',
  ]);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

const unavailableApp = express();
unavailableApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  client: { ...client, configured: false },
  invalidateParserDataCaches: async () => undefined,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const unavailableServer = unavailableApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  unavailableServer.once('listening', resolve);
  unavailableServer.once('error', reject);
});
const unavailableAddress = unavailableServer.address();
assert.ok(unavailableAddress && typeof unavailableAddress === 'object');
try {
  const response = await fetch(`http://127.0.0.1:${unavailableAddress.port}/api/admin/parser-control`, {
    headers: { 'X-Admin': 'yes' },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    code: 'HS_DATA_API_NOT_CONFIGURED',
    error: 'Управление парсерами ещё не подключено к API данных',
  });
} finally {
  await new Promise<void>((resolve, reject) => unavailableServer.close(error => error ? reject(error) : resolve()));
}

const warnings: Array<{ scope: string; error: unknown }> = [];
const invalidationFailureApp = express();
invalidationFailureApp.use(express.json());
invalidationFailureApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  client,
  invalidateParserDataCaches: async () => {
    throw new Error('Redis unavailable');
  },
  onWarning: (scope, error) => warnings.push({ scope, error }),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const invalidationFailureServer = invalidationFailureApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  invalidationFailureServer.once('listening', resolve);
  invalidationFailureServer.once('error', reject);
});
const invalidationFailureAddress = invalidationFailureServer.address();
assert.ok(invalidationFailureAddress && typeof invalidationFailureAddress === 'object');
try {
  const response = await fetch(
    `http://127.0.0.1:${invalidationFailureAddress.port}/api/admin/parser-control/policy`,
    {
      method: 'PATCH',
      headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'stable', expectedRevision: 5, reason: 'Возврат к стабильной мете' }),
    },
  );
  assert.equal(response.status, 200, 'saved policy must not be rolled back when invalidation fails');
  const body = await response.json() as { revision: number; warnings: Array<{ code: string; message: string }> };
  assert.equal(body.revision, 5);
  assert.equal(body.warnings[0]?.code, 'CACHE_INVALIDATION_FAILED');
  assert.match(body.warnings[0]?.message ?? '', /сохранена/i);
  assert.equal(warnings[0]?.scope, 'cache-invalidation');
} finally {
  await new Promise<void>((resolve, reject) => invalidationFailureServer.close(error => error ? reject(error) : resolve()));
}

console.log('admin parser control router contract tests passed');
