import assert from 'node:assert/strict';
import express from 'express';
import { evaluateDataHealth } from '../server/health.js';
import { createMetricsRouter, HttpMetrics } from '../server/metrics.js';
import { requestLoggingMiddleware } from '../server/observability.js';

const now = Date.parse('2026-07-11T12:00:00.000Z');
const health = evaluateDataHealth([
  { name: 'winrates', updatedAt: new Date(now - 60_000).toISOString(), records: 11 },
], { now });
const metrics = new HttpMetrics();
metrics.arenaDraftRefreshFinished({
  status: 'succeeded',
  trigger: 'scheduled',
  durationMs: 12_500,
  sourceRows: 500,
  publishedClassCount: 10,
  finishedAt: '2026-07-11T11:59:30.000Z',
});
metrics.arenaDraftRefreshFinished({
  status: 'failed',
  trigger: 'manual',
  durationMs: 1_000,
  sourceRows: 0,
  publishedClassCount: 0,
  finishedAt: '2026-07-11T11:59:40.000Z',
});
const app = express();
app.use(requestLoggingMiddleware(() => {}, metrics));
app.get('/items/:id', (_req, res) => res.json({ ok: true }));
app.get('/failure', (_req, res) => res.status(503).json({ error: 'temporary' }));
const router = createMetricsRouter({ metrics, getDataHealth: () => health, getRelease: () => 'test-release' });
app.use('/metrics', router);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${origin}/items/123?email=private@example.test`)).status, 200);
  assert.equal((await fetch(`${origin}/failure`)).status, 503);
  const response = await fetch(`${origin}/metrics`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^text\/plain/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.text();
  assert.match(body, /hs_arena_http_requests_total\{method="GET",route="\/items\/:id",status_class="2xx"\} 1/);
  assert.match(body, /hs_arena_http_requests_total\{method="GET",route="\/failure",status_class="5xx"\} 1/);
  assert.match(body, /hs_arena_http_request_duration_seconds_bucket\{method="GET",route="\/items\/:id",le="\+Inf"\} 1/);
  assert.match(body, /hs_arena_ready 1/);
  assert.match(body, /hs_arena_dataset_age_seconds\{dataset="winrates",state="fresh"\} 60/);
  assert.match(body, /hs_arena_release_info\{release="test-release"\} 1/);
  assert.match(body, /hs_arena_draft_refresh_total\{status="succeeded",trigger="scheduled"\} 1/);
  assert.match(body, /hs_arena_draft_refresh_total\{status="failed",trigger="manual"\} 1/);
  assert.match(body, /hs_arena_draft_refresh_duration_seconds_bucket\{status="succeeded",trigger="scheduled",le="\+Inf"\} 1/);
  assert.match(body, /hs_arena_draft_refresh_last_success_timestamp_seconds 1783771170/);
  assert.match(body, /hs_arena_draft_refresh_source_rows 500/);
  assert.match(body, /hs_arena_draft_refresh_published_classes 10/);
  assert.doesNotMatch(body, /123|private@example\.test|email=/);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('metrics contract tests passed');
