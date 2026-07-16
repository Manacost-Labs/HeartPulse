import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { createAdminStandardOperationsRouter, type StandardCacheTarget } from '../server/adminStandardOperationsRoutes.js';

const resets: StandardCacheTarget[] = [];
const adminGuard: RequestHandler = (request, response, next) => request.headers['x-admin'] === 'yes' ? next() : response.status(403).end();
const app = express();
app.use(express.json());
app.use('/api', createAdminStandardOperationsRouter({
  adminGuard,
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  getStatus: () => ({ generatedAt: '2026-07-16T00:00:00.000Z', caches: { previews: resets.length } }),
  resetCache: target => resets.push(target),
  setPrivateNoStore: response => response.set('Cache-Control', 'no-store'),
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const url = `http://127.0.0.1:${address.port}/api/admin/standard-operations`;
try {
  assert.equal((await fetch(url)).status, 403);
  const status = await fetch(url, { headers: { 'X-Admin': 'yes' } });
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  const invalid = await fetch(`${url}/reset`, { method: 'POST', headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'files' }) });
  assert.equal(invalid.status, 400);
  const reset = await fetch(`${url}/reset`, { method: 'POST', headers: { 'X-Admin': 'yes', 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'previews' }) });
  assert.equal(reset.status, 200);
  assert.deepEqual(resets, ['previews']);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
console.log('admin Standard operations router contract tests passed');
