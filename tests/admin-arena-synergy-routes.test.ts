import assert from 'node:assert/strict';
import express from 'express';
import { createAdminArenaSynergyRouter } from '../server/adminArenaSynergyRoutes.js';

let upstreamFails = false;
let requestedClass = '';
let forceRefresh = false;
let reportedError: unknown;
const app = express();
app.use('/api', createAdminArenaSynergyRouter({
  adminGuard: (request, response, next) => (
    request.headers['x-test-admin'] === '1'
      ? next()
      : response.status(401).json({ error: 'Требуется вход' })
  ),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  csrfAllowed: () => true,
  loadAnalysis: async (className, options) => {
    requestedClass = className;
    forceRefresh = options.forceRefresh;
    if (upstreamFails) throw new Error('secret upstream location');
    return {
      schemaVersion: 1,
      selectedClass: className,
      summary: { runsAnalyzed: 40 },
    };
  },
  onError: error => { reportedError = error; },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/admin/arena-synergies`;

try {
  assert.equal((await fetch(endpoint)).status, 401);

  const response = await fetch(`${endpoint}?class=MAGE&refresh=1`, {
    headers: { 'X-Test-Admin': '1' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(requestedClass, 'MAGE');
  assert.equal(forceRefresh, true);
  assert.equal((await response.json() as any).summary.runsAnalyzed, 40);

  const invalid = await fetch(`${endpoint}?class=<script>`, {
    headers: { 'X-Test-Admin': '1' },
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json() as any).code, 'INVALID_ARENA_CLASS');

  upstreamFails = true;
  const failed = await fetch(endpoint, { headers: { 'X-Test-Admin': '1' } });
  assert.equal(failed.status, 502);
  const failure = await failed.json() as any;
  assert.equal(failure.code, 'ARENA_SYNERGIES_UNAVAILABLE');
  assert.equal(failure.error, 'Не удалось рассчитать сочетания Арены');
  assert.ok(reportedError instanceof Error);
  assert.equal(JSON.stringify(failure).includes('secret upstream location'), false);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin arena synergy routes tests passed');
