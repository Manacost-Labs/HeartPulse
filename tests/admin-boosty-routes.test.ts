import assert from 'node:assert/strict';
import express from 'express';
import { createAdminBoostyRouter } from '../server/adminBoostyRoutes.js';

let failure: 'status' | 'subscribers' | null = null;
let includeInactive: boolean | null = null;
const app = express();
app.use('/api', createAdminBoostyRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  getStatus: async () => {
    if (failure === 'status') throw new Error('token at /private/boosty.env');
    return {
      configured: true,
      ok: false,
      importStatus: 'stale',
      source: 'snapshot',
      stale: true,
      lastErrorCategory: 'origin',
      lastErrorMessage: 'token at /private/boosty.env',
      error: 'secret upstream error',
      detail: 'http://127.0.0.1:18082/private',
      summary: { activePaid: 2 },
    };
  },
  getSubscribers: async value => {
    includeInactive = value;
    if (failure === 'subscribers') throw new Error('token at /private/boosty.env');
    return { configured: true, source: 'snapshot', stale: false, subscribers: [{ id: 'subscriber-1' }] };
  },
  configured: () => true,
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  now: () => new Date('2026-07-13T03:00:00.000Z'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/admin/boosty`;
const request = (path: string, admin = true) => fetch(`${base}${path}`, { headers: admin ? { 'X-Admin': 'yes' } : {} });

try {
  for (const path of ['/status', '/subscribers']) {
    const forbidden = await request(path, false);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');
  }

  const status = await request('/status');
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('cache-control'), 'private, no-store');
  const statusPayload = await status.json() as Record<string, unknown>;
  assert.equal(statusPayload.lastErrorMessage, 'Boosty API временно недоступен.');
  assert.equal(statusPayload.error, undefined);
  assert.equal(statusPayload.detail, undefined);
  assert.doesNotMatch(JSON.stringify(statusPayload), /private|127\.0\.0\.1|secret/i);

  const subscribers = await request('/subscribers');
  assert.equal(subscribers.status, 200);
  assert.equal(includeInactive, true);
  assert.deepEqual(await subscribers.json(), { configured: true, source: 'snapshot', stale: false, subscribers: [{ id: 'subscriber-1' }] });

  await request('/subscribers?includeInactive=0');
  assert.equal(includeInactive, false);

  failure = 'status';
  const failedStatus = await request('/status');
  assert.equal(failedStatus.status, 502);
  assert.deepEqual(await failedStatus.json(), {
    configured: true,
    ok: false,
    importStatus: 'error',
    source: 'unavailable',
    stale: true,
    snapshotAgeSeconds: null,
    lastErrorCategory: 'request-failed',
    lastErrorMessage: 'Boosty API временно недоступен.',
    warnings: ['boosty-api-unavailable'],
    summary: {},
    checkedAt: '2026-07-13T03:00:00.000Z',
  });

  failure = 'subscribers';
  const failedSubscribers = await request('/subscribers');
  assert.equal(failedSubscribers.status, 502);
  assert.equal(failedSubscribers.headers.get('cache-control'), 'private, no-store');
  const failedSubscribersPayload = await failedSubscribers.json();
  assert.deepEqual(failedSubscribersPayload, {
    configured: true,
    source: 'unavailable',
    stale: true,
    subscribers: [],
    summary: {},
    levels: {},
    fetchedAt: '2026-07-13T03:00:00.000Z',
    error: 'Не удалось загрузить подписчиков Boosty',
  });
  assert.doesNotMatch(JSON.stringify(failedSubscribersPayload), /private|127\.0\.0\.1|token/i);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin Boosty router contract tests passed');
