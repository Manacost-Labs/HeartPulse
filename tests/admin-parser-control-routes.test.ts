import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createAdminParserControlRouter,
  type AdminParserControlClient,
} from '../server/adminParserControlRoutes.js';
import { csrfRequestAllowed } from '../server/csrf.js';

const APP_ORIGIN = 'https://arena.hs-manacost.ru';
const csrfAllowed = (request: express.Request): boolean => csrfRequestAllowed({
  method: request.method,
  path: new URL(request.originalUrl, APP_ORIGIN).pathname,
  authCookiePresent: true,
  csrfHeader: request.headers['x-csrf-request'],
  origin: request.headers.origin,
  referer: request.headers.referer,
  secFetchSite: request.headers['sec-fetch-site'],
  appUrl: APP_ORIGIN,
});
const mutationHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  'X-Admin': 'yes',
  'Content-Type': 'application/json',
  'X-CSRF-Request': '1',
  Origin: APP_ORIGIN,
  'Sec-Fetch-Site': 'same-origin',
  ...extra,
});

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
    return {
      run: { id: 'run-1', status: 'succeeded' },
      deduplicated: false,
    };
  },
  listRuns: async () => ({ runs: [{ id: 'run-1', status: 'queued' }] }),
};

const audits: Array<{ action: string; entityId: string; details?: Record<string, unknown> }> = [];
const auditReadLimits: number[] = [];
const adminGuard: RequestHandler = (request, response, next) => request.headers['x-admin'] === 'yes'
  ? next()
  : response.status(403).end();
const app = express();
app.use(express.json());
app.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  csrfAllowed,
  client,
  invalidateParserDataCaches: async context => {
    invalidations.push(context);
  },
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  recordAudit: (_actor, action, entityId, details) => audits.push({ action, entityId, details }),
  listAudit: limit => {
    auditReadLimits.push(limit);
    return [{
      id: 'audit-1',
      actor: { id: 'admin-1', name: 'Администратор' },
      action: 'parser-control.policy.update',
      entityId: 'early',
      details: {
        summary: 'Включена ранняя мета',
        revision: 5,
        requestId: 'audit-policy-request',
        before: { revision: 4 },
        after: { revision: 5, mode: 'early' },
      },
      createdAt: '2026-07-21T10:00:00.000Z',
    }];
  },
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
  const forbidden = await fetch(url);
  assert.equal(forbidden.status, 403, 'all parser controls stay behind full-admin guard');
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');

  const forbiddenAudit = await fetch(`${url}/audit`);
  assert.equal(forbiddenAudit.status, 403, 'the audit log stays behind the same full-admin guard');
  assert.equal(forbiddenAudit.headers.get('cache-control'), 'private, no-store');

  const status = await fetch(url, { headers: { 'X-Admin': 'yes' } });
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await status.json(), { revision: 4, policy: { mode: 'stable' }, sections: [] });

  const audit = await fetch(`${url}/audit?limit=250`, { headers: { 'X-Admin': 'yes' } });
  assert.equal(audit.status, 200);
  assert.equal(audit.headers.get('cache-control'), 'private, no-store');
  assert.equal(auditReadLimits.at(-1), 100, 'audit limits are bounded before reaching the store');
  assert.deepEqual((await audit.json() as { entries: unknown[] }).entries[0], {
    id: 'audit-1',
    actor: { id: 'admin-1', name: 'Администратор' },
    action: 'parser-control.policy.update',
    entityId: 'early',
    details: {
      summary: 'Включена ранняя мета',
      revision: 5,
      requestId: 'audit-policy-request',
      before: { revision: 4 },
      after: { revision: 5, mode: 'early' },
    },
    createdAt: '2026-07-21T10:00:00.000Z',
  });

  const missingCsrf = await fetch(`${url}/policy`, {
    method: 'PATCH',
    headers: {
      'X-Admin': 'yes',
      'Content-Type': 'application/json',
      Origin: APP_ORIGIN,
    },
    body: JSON.stringify({ mode: 'stable', expectedRevision: 4 }),
  });
  assert.equal(missingCsrf.status, 403, 'cookie-authenticated mutations require X-CSRF-Request');
  assert.equal(missingCsrf.headers.get('cache-control'), 'private, no-store');

  const invalidCsrf = await fetch(`${url}/sections`, {
    method: 'PATCH',
    headers: mutationHeaders({ 'X-CSRF-Request': '0' }),
    body: JSON.stringify({ sections: { arena: true }, expectedRevision: 4 }),
  });
  assert.equal(invalidCsrf.status, 403, 'invalid X-CSRF-Request is rejected');

  const crossOriginCsrf = await fetch(`${url}/runs`, {
    method: 'POST',
    headers: mutationHeaders({ Origin: 'https://attacker.example' }),
    body: JSON.stringify({ sectionIds: ['arena'], reason: 'Cross-site request' }),
  });
  assert.equal(crossOriginCsrf.status, 403, 'the CSRF marker does not bypass the same-origin check');
  assert.equal(calls.length, 0, 'rejected CSRF attempts never reach the parser API client');

  const invalidPolicy = await fetch(`${url}/policy`, {
    method: 'PATCH',
    headers: mutationHeaders(),
    body: JSON.stringify({ mode: 'instant', expectedRevision: 4 }),
  });
  assert.equal(invalidPolicy.status, 400);
  assert.equal(invalidPolicy.headers.get('cache-control'), 'private, no-store');

  const invalidRevision = await fetch(`${url}/policy`, {
    method: 'PATCH',
    headers: mutationHeaders(),
    body: JSON.stringify({ mode: 'stable', expectedRevision: 0 }),
  });
  assert.equal(invalidRevision.status, 400);

  const earlyUntil = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
  const earlyPolicy = await fetch(`${url}/policy`, {
    method: 'PATCH',
    headers: mutationHeaders({ 'X-Request-ID': 'audit-policy-request' }),
    body: JSON.stringify({
      mode: 'early',
      earlyUntil,
      reason: 'Балансный патч',
      expectedRevision: 4,
    }),
  });
  assert.equal(earlyPolicy.status, 200);
  assert.deepEqual((await earlyPolicy.json() as { warnings?: unknown }).warnings, undefined);
  assert.deepEqual(invalidations, [{ reason: 'policy-change' }]);

  const invalidSections = await fetch(`${url}/sections`, {
    method: 'PATCH',
    headers: mutationHeaders(),
    body: JSON.stringify({ sections: { '../../../etc/passwd': true }, expectedRevision: 5 }),
  });
  assert.equal(invalidSections.status, 400);

  const sections = await fetch(`${url}/sections`, {
    method: 'PATCH',
    headers: mutationHeaders(),
    body: JSON.stringify({ sections: { arena: true, battlegrounds: false }, expectedRevision: 5 }),
  });
  assert.equal(sections.status, 200);

  const invalidRun = await fetch(`${url}/runs`, {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ sectionIds: [] }),
  });
  assert.equal(invalidRun.status, 400);

  const run = await fetch(`${url}/runs`, {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ sectionIds: ['arena'], sourceIds: ['hsreplay_arena'], reason: 'Ручная проверка' }),
  });
  assert.equal(run.status, 202);
  assert.deepEqual(await run.json(), {
    run: { id: 'run-1', status: 'succeeded' },
    deduplicated: false,
  });
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
  assert.deepEqual(audits[0]?.details, {
    summary: 'Включена ранняя мета',
    requestId: 'audit-policy-request',
    revision: 5,
    before: { revision: 4 },
    after: {
      revision: 5,
      mode: 'early',
      earlyUntil,
      reason: 'Балансный патч',
    },
    earlyUntil,
    reason: 'Балансный патч',
    expectedRevision: 4,
  });
  assert.equal(audits[2]?.entityId, 'run-1', 'manual runs are correlated with their durable run id');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

const unavailableApp = express();
unavailableApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  csrfAllowed,
  client: { ...client, configured: false },
  invalidateParserDataCaches: async () => undefined,
  listAudit: () => [{ id: 'offline-audit' }],
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
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), {
    code: 'HS_DATA_API_NOT_CONFIGURED',
    error: 'Управление парсерами ещё не подключено к API данных',
  });
  const audit = await fetch(`http://127.0.0.1:${unavailableAddress.port}/api/admin/parser-control/audit`, {
    headers: { 'X-Admin': 'yes' },
  });
  assert.equal(audit.status, 200, 'local audit remains readable while the data API is unconfigured');
  assert.deepEqual(await audit.json(), { entries: [{ id: 'offline-audit' }] });
} finally {
  await new Promise<void>((resolve, reject) => unavailableServer.close(error => error ? reject(error) : resolve()));
}

const missingIdentityApp = express();
missingIdentityApp.use(express.json());
missingIdentityApp.use('/api', createAdminParserControlRouter({
  adminGuard: (_request, _response, next) => next(),
  adminAuth: () => null,
  csrfAllowed,
  client,
  invalidateParserDataCaches: async () => undefined,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const missingIdentityServer = missingIdentityApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  missingIdentityServer.once('listening', resolve);
  missingIdentityServer.once('error', reject);
});
const missingIdentityAddress = missingIdentityServer.address();
assert.ok(missingIdentityAddress && typeof missingIdentityAddress === 'object');
try {
  const response = await fetch(
    `http://127.0.0.1:${missingIdentityAddress.port}/api/admin/parser-control/policy`,
    {
      method: 'PATCH',
      headers: mutationHeaders(),
      body: JSON.stringify({ mode: 'stable', expectedRevision: 4 }),
    },
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
} finally {
  await new Promise<void>((resolve, reject) => missingIdentityServer.close(error => error ? reject(error) : resolve()));
}

const auditReadWarnings: Array<{ scope: string; action?: string }> = [];
const auditReadFailureApp = express();
auditReadFailureApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  csrfAllowed,
  client,
  invalidateParserDataCaches: async () => undefined,
  listAudit: () => { throw new Error('/private/admin-audit.sqlite is locked'); },
  onWarning: (scope, _error, context) => auditReadWarnings.push({ scope, action: context?.action }),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const auditReadFailureServer = auditReadFailureApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  auditReadFailureServer.once('listening', resolve);
  auditReadFailureServer.once('error', reject);
});
const auditReadFailureAddress = auditReadFailureServer.address();
assert.ok(auditReadFailureAddress && typeof auditReadFailureAddress === 'object');
try {
  const response = await fetch(
    `http://127.0.0.1:${auditReadFailureAddress.port}/api/admin/parser-control/audit`,
    { headers: { 'X-Admin': 'yes' } },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), {
    code: 'PARSER_AUDIT_UNAVAILABLE',
    error: 'Журнал действий временно недоступен',
  }, 'internal database paths must not leak through the BFF');
  assert.deepEqual(auditReadWarnings, [{ scope: 'audit', action: 'parser-control.audit.read' }]);
} finally {
  await new Promise<void>((resolve, reject) => auditReadFailureServer.close(error => error ? reject(error) : resolve()));
}

const warnings: Array<{ scope: string; error: unknown }> = [];
const invalidationFailureApp = express();
invalidationFailureApp.use(express.json());
invalidationFailureApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  csrfAllowed,
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
      headers: mutationHeaders(),
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

const auditWarnings: Array<{
  scope: string;
  requestId: string | null | undefined;
  action: string | undefined;
  error: unknown;
}> = [];
const auditFailureApp = express();
auditFailureApp.use(express.json());
auditFailureApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  csrfAllowed,
  client,
  invalidateParserDataCaches: async () => undefined,
  onWarning: (scope, error, context) => auditWarnings.push({
    scope,
    requestId: context?.requestId,
    action: context?.action,
    error,
  }),
  recordAudit: () => {
    throw new Error('Audit database is read-only');
  },
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const auditFailureServer = auditFailureApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  auditFailureServer.once('listening', resolve);
  auditFailureServer.once('error', reject);
});
const auditFailureAddress = auditFailureServer.address();
assert.ok(auditFailureAddress && typeof auditFailureAddress === 'object');
const auditFailureUrl = `http://127.0.0.1:${auditFailureAddress.port}/api/admin/parser-control`;
try {
  const policy = await fetch(`${auditFailureUrl}/policy`, {
    method: 'PATCH',
    headers: mutationHeaders({
      'X-Request-ID': 'parser-audit-policy',
    }),
    body: JSON.stringify({ mode: 'stable', expectedRevision: 5, reason: 'Возврат к стабильной мете' }),
  });
  assert.equal(policy.status, 200, 'an audit failure must not turn a saved policy into 5xx');
  const policyBody = await policy.json() as { warnings: Array<{ code: string; requestId?: string }> };
  assert.equal(policyBody.warnings[0]?.code, 'AUDIT_WRITE_FAILED');
  assert.equal(policyBody.warnings[0]?.requestId, 'parser-audit-policy');

  const sections = await fetch(`${auditFailureUrl}/sections`, {
    method: 'PATCH',
    headers: mutationHeaders({
      'X-Request-ID': 'parser-audit-sections',
    }),
    body: JSON.stringify({ sections: { arena: true }, expectedRevision: 5 }),
  });
  assert.equal(sections.status, 200, 'an audit failure must not turn saved sections into 5xx');
  assert.equal((await sections.json() as { warnings: Array<{ code: string }> }).warnings[0]?.code, 'AUDIT_WRITE_FAILED');

  const run = await fetch(`${auditFailureUrl}/runs`, {
    method: 'POST',
    headers: mutationHeaders({
      'X-Request-ID': 'parser-audit-run',
    }),
    body: JSON.stringify({ sectionIds: ['arena'], reason: 'Ручная проверка' }),
  });
  assert.equal(run.status, 202, 'an audit failure must not reject an accepted parser run');
  assert.equal((await run.json() as { warnings: Array<{ code: string }> }).warnings[0]?.code, 'AUDIT_WRITE_FAILED');
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(
    auditWarnings.map(warning => ({
      scope: warning.scope,
      requestId: warning.requestId,
      action: warning.action,
      message: warning.error instanceof Error ? warning.error.message : String(warning.error),
    })),
    [
      {
        scope: 'audit',
        requestId: 'parser-audit-policy',
        action: 'parser-control.policy.update',
        message: 'Audit database is read-only',
      },
      {
        scope: 'audit',
        requestId: 'parser-audit-sections',
        action: 'parser-control.sections.update',
        message: 'Audit database is read-only',
      },
      {
        scope: 'audit',
        requestId: 'parser-audit-run',
        action: 'parser-control.run.create',
        message: 'Audit database is read-only',
      },
    ],
  );
} finally {
  await new Promise<void>((resolve, reject) => auditFailureServer.close(error => error ? reject(error) : resolve()));
}

const duplicateWarningApp = express();
duplicateWarningApp.use(express.json());
duplicateWarningApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  csrfAllowed,
  client: {
    ...client,
    updatePolicy: async () => ({
      revision: 6,
      policy: { mode: 'stable' },
      sections: [],
      warnings: [{
        code: 'AUDIT_WRITE_FAILED',
        message: 'Настройка сохранена, но запись в журнал аудита не удалась. Проверьте журнал сервиса.',
      }],
    }),
  },
  invalidateParserDataCaches: async () => undefined,
  recordAudit: () => {
    throw new Error('Audit database is read-only');
  },
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const duplicateWarningServer = duplicateWarningApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  duplicateWarningServer.once('listening', resolve);
  duplicateWarningServer.once('error', reject);
});
const duplicateWarningAddress = duplicateWarningServer.address();
assert.ok(duplicateWarningAddress && typeof duplicateWarningAddress === 'object');
try {
  const response = await fetch(
    `http://127.0.0.1:${duplicateWarningAddress.port}/api/admin/parser-control/policy`,
    {
      method: 'PATCH',
      headers: mutationHeaders({
        'X-Request-ID': 'parser-duplicate-warning',
      }),
      body: JSON.stringify({ mode: 'stable', expectedRevision: 5, reason: 'Возврат к стабильной мете' }),
    },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { warnings: Array<{ code: string; requestId?: string }> };
  assert.deepEqual(body.warnings.map(warning => warning.code), ['AUDIT_WRITE_FAILED']);
  assert.equal(
    body.warnings[0]?.requestId,
    'parser-duplicate-warning',
    'the BFF warning should enrich an upstream warning with the correlated request id',
  );
} finally {
  await new Promise<void>((resolve, reject) => duplicateWarningServer.close(error => error ? reject(error) : resolve()));
}

const monitorWarnings: string[] = [];
const monitorFailureApp = express();
monitorFailureApp.use(express.json());
monitorFailureApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  csrfAllowed,
  client: {
    ...client,
    createRun: async () => ({
      run: { id: 'run-monitor-failure', status: 'running' },
      deduplicated: false,
    }),
  },
  invalidateParserDataCaches: async () => undefined,
  runMonitor: {
    now: () => {
      throw new Error('Monotonic clock unavailable');
    },
  },
  onWarning: (scope, error) => monitorWarnings.push(`${scope}:${error instanceof Error ? error.message : String(error)}`),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const monitorFailureServer = monitorFailureApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  monitorFailureServer.once('listening', resolve);
  monitorFailureServer.once('error', reject);
});
const monitorFailureAddress = monitorFailureServer.address();
assert.ok(monitorFailureAddress && typeof monitorFailureAddress === 'object');
try {
  const response = await fetch(
    `http://127.0.0.1:${monitorFailureAddress.port}/api/admin/parser-control/runs`,
    {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ sectionIds: ['arena'], reason: 'Проверка наблюдения' }),
    },
  );
  assert.equal(response.status, 202, 'a monitoring failure must not reject an accepted parser run');
  const body = await response.json() as {
    run: { id: string };
    deduplicated: boolean;
    warnings: Array<{ code: string }>;
  };
  assert.equal(body.run.id, 'run-monitor-failure');
  assert.equal(body.deduplicated, false);
  assert.equal(body.warnings[0]?.code, 'RUN_MONITOR_FAILED');
  assert.deepEqual(monitorWarnings, ['run-monitor:Monotonic clock unavailable']);
} finally {
  await new Promise<void>((resolve, reject) => monitorFailureServer.close(error => error ? reject(error) : resolve()));
}

const upstreamAuthApp = express();
upstreamAuthApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  csrfAllowed,
  client: {
    ...client,
    getControl: async () => {
      throw Object.assign(new Error('Invalid upstream API key'), {
        status: 401,
        code: 'UNAUTHORIZED',
      });
    },
  },
  invalidateParserDataCaches: async () => undefined,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const upstreamAuthServer = upstreamAuthApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  upstreamAuthServer.once('listening', resolve);
  upstreamAuthServer.once('error', reject);
});
const upstreamAuthAddress = upstreamAuthServer.address();
assert.ok(upstreamAuthAddress && typeof upstreamAuthAddress === 'object');
try {
  const response = await fetch(
    `http://127.0.0.1:${upstreamAuthAddress.port}/api/admin/parser-control`,
    { headers: { 'X-Admin': 'yes' } },
  );
  assert.equal(response.status, 502, 'upstream credentials are a server failure, not a browser session failure');
  assert.deepEqual(await response.json(), {
    code: 'HS_DATA_API_AUTH_FAILED',
    error: 'Сайт не смог авторизоваться в API данных. Проверьте серверный ключ HS_DATA_API_ADMIN_KEY.',
  });
} finally {
  await new Promise<void>((resolve, reject) => upstreamAuthServer.close(error => error ? reject(error) : resolve()));
}

const revisionConflictApp = express();
revisionConflictApp.use(express.json());
revisionConflictApp.use('/api', createAdminParserControlRouter({
  adminGuard,
  adminAuth: () => ({ id: 'admin-1' }),
  csrfAllowed,
  client: {
    ...client,
    updatePolicy: async () => {
      throw Object.assign(new Error('Настройки уже изменил другой администратор'), {
        status: 409,
        code: 'REVISION_CONFLICT',
      });
    },
  },
  invalidateParserDataCaches: async () => undefined,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
}));
const revisionConflictServer = revisionConflictApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  revisionConflictServer.once('listening', resolve);
  revisionConflictServer.once('error', reject);
});
const revisionConflictAddress = revisionConflictServer.address();
assert.ok(revisionConflictAddress && typeof revisionConflictAddress === 'object');
try {
  const response = await fetch(
    `http://127.0.0.1:${revisionConflictAddress.port}/api/admin/parser-control/policy`,
    {
      method: 'PATCH',
      headers: mutationHeaders(),
      body: JSON.stringify({ mode: 'stable', expectedRevision: 5, reason: 'Возврат к стабильной мете' }),
    },
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    code: 'REVISION_CONFLICT',
    error: 'Настройки уже изменил другой администратор',
  });
} finally {
  await new Promise<void>((resolve, reject) => revisionConflictServer.close(error => error ? reject(error) : resolve()));
}

console.log('admin parser control router contract tests passed');
