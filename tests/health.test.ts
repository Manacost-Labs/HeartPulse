import assert from 'node:assert/strict';
import express from 'express';
import { DEFAULT_DATA_MAX_AGE_MS, evaluateDataHealth } from '../server/health.js';
import { createHealthRouter } from '../server/healthRoutes.js';
import { createUpstreamDataHealthMonitor } from '../server/upstreamDataHealth.js';
import { createCriticalDataHealth } from '../server/criticalDataHealth.js';

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

const explicitConstructedLkg = evaluateDataHealth([{
  name: 'constructed-cards-standard',
  updatedAt: new Date(now - 60_000).toISOString(),
  source: 'db.kolodahs.ru:last-known-good',
  records: 1_152,
  state: 'stale',
  dataStatus: 'stale',
  cacheSource: 'LKG',
}], { now });
assert.equal(explicitConstructedLkg.status, 'degraded',
  'a recently verified LKG remains degraded because upstream freshness was not confirmed');
assert.equal(explicitConstructedLkg.fresh, false);
assert.equal(explicitConstructedLkg.datasets[0].state, 'stale');
assert.equal(explicitConstructedLkg.datasets[0].dataStatus, 'stale');
assert.equal(explicitConstructedLkg.datasets[0].cacheSource, 'LKG');

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

const parserMonitor = createUpstreamDataHealthMonitor({
  url: 'https://api.example.test/v1/system/health',
  fetchImpl: async () => new Response(JSON.stringify({
    data: {
      freshness_ok: false,
      stale_sources: ['hsguru_meta_matrix'],
      hard_failed_sources: ['hsguru_meta_matrix'],
    },
    meta: { fetched_at: '2026-07-11T11:59:00.000Z', count: 96 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  now: () => now,
});
await parserMonitor.refresh();
const parserInput = parserMonitor.getInput();
assert.equal(parserInput.name, 'hs-data-api');
assert.equal(parserInput.state, 'stale');
assert.equal(parserInput.records, 96);
assert.match(String(parserInput.warning), /hsguru_meta_matrix/);

const criticalDataHealth = createCriticalDataHealth({
  loadDataset: filename => ({
    data: {
      updatedAt: '2026-07-11T11:59:00.000Z',
      source: filename,
      classes: filename === 'winrates.json' ? [{}] : undefined,
      sections: filename === 'tierlist.json' ? [{}] : undefined,
      groups: filename === 'legendaries.json' ? [{}] : undefined,
    },
  }),
  getConstructedCatalogHealth: () => ({
    dataStatus: 'fresh',
    verifiedAt: '2026-07-11T11:59:00.000Z',
    records: 100,
    state: 'fresh',
  }),
  getUpstreamInput: parserMonitor.getInput,
});
const criticalReport = criticalDataHealth();
assert.equal(criticalReport.status, 'degraded');
assert.equal(criticalReport.datasets.at(-1)?.name, 'hs-data-api');
assert.equal(criticalReport.datasets.at(-1)?.state, 'stale');

const failedParserMonitor = createUpstreamDataHealthMonitor({
  url: 'https://api.example.test/v1/system/health',
  fetchImpl: async () => { throw new Error('network unavailable'); },
  now: () => now,
});
await failedParserMonitor.refresh();
assert.equal(failedParserMonitor.getInput().state, 'missing');
assert.match(String(failedParserMonitor.getInput().warning), /network unavailable/);

let activeReport = fresh;
const app = express();
const healthRouter = createHealthRouter({
  getDataHealth: () => activeReport,
  getRelease: () => 'test-release',
  getUptimeSeconds: () => 42.9,
  now: () => new Date(now),
});
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

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

  const proxiedLiveResponse = await fetch(`${origin}/api/health/live`);
  assert.equal(proxiedLiveResponse.status, 200);
  assert.equal((await proxiedLiveResponse.json()).status, 'alive');

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
