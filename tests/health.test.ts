import assert from 'node:assert/strict';
import express from 'express';
import { DEFAULT_DATA_MAX_AGE_MS, evaluateDataHealth } from '../server/health.js';
import { createHealthRouter } from '../server/healthRoutes.js';

const now = Date.parse('2026-07-11T12:00:00.000Z');
const freshInputs = [
  { name: 'winrates', updatedAt: new Date(now - 60_000).toISOString(), source: 'hsreplay', records: 11 },
  { name: 'tierlist', updatedAt: new Date(now - DEFAULT_DATA_MAX_AGE_MS).toISOString(), source: 'heartharena', records: 12 },
];

const fresh = evaluateDataHealth(freshInputs, { now });
assert.equal(fresh.status, 'ok');
assert.equal(fresh.ready, true);
assert.equal(fresh.fresh, true);
assert.equal(fresh.datasets[0].records, 11);

const stale = evaluateDataHealth([
  ...freshInputs.slice(0, 1),
  { name: 'tierlist', updatedAt: new Date(now - DEFAULT_DATA_MAX_AGE_MS - 1).toISOString() },
], { now });
assert.equal(stale.status, 'degraded');
assert.equal(stale.ready, true);
assert.equal(stale.fresh, false);
assert.equal(stale.datasets[1].state, 'stale');

const missing = evaluateDataHealth([{ name: 'winrates', updatedAt: null }], { now });
assert.equal(missing.status, 'unavailable');
assert.equal(missing.ready, false);
assert.equal(missing.datasets[0].state, 'missing');

const invalid = evaluateDataHealth([
  { name: 'winrates', updatedAt: 'not-a-date' },
  { name: 'tierlist', updatedAt: new Date(now + 10 * 60_000).toISOString() },
], { now });
assert.equal(invalid.ready, false);
assert.deepEqual(invalid.datasets.map(dataset => dataset.state), ['invalid', 'invalid']);

const empty = evaluateDataHealth([], { now });
assert.equal(empty.status, 'unavailable');
assert.equal(empty.ready, false);

let activeReport = fresh;
const app = express();
app.use('/health', createHealthRouter({
  getDataHealth: () => activeReport,
  getRelease: () => 'test-release',
  getUptimeSeconds: () => 42.9,
  now: () => new Date(now),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const liveResponse = await fetch(`${origin}/health/live`);
  assert.equal(liveResponse.status, 200);
  assert.equal(liveResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await liveResponse.json(), {
    status: 'alive',
    checkedAt: '2026-07-11T12:00:00.000Z',
    uptimeSeconds: 42,
    release: 'test-release',
  });

  activeReport = stale;
  const staleReadyResponse = await fetch(`${origin}/health/ready`);
  assert.equal(staleReadyResponse.status, 200);
  assert.equal((await staleReadyResponse.json()).dataStatus, 'degraded');
  const staleDataResponse = await fetch(`${origin}/health/data`);
  assert.equal(staleDataResponse.status, 503);
  assert.equal(staleDataResponse.headers.get('cache-control'), 'no-store');

  activeReport = missing;
  const missingReadyResponse = await fetch(`${origin}/health/ready`);
  assert.equal(missingReadyResponse.status, 503);
  assert.equal((await missingReadyResponse.json()).status, 'not-ready');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('health evaluation tests passed');
