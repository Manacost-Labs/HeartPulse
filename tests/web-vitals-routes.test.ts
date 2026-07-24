import assert from 'node:assert/strict';
import express from 'express';
import {
  createWebVitalsRouter,
  normalizeWebVitalMetric,
  normalizeWebVitalsPayload,
} from '../server/webVitalsRoutes.js';
import type { ServerWebVitalMetric } from '../server/sentry.js';

const validMetric: ServerWebVitalMetric = {
  name: 'INP',
  value: 148,
  rating: 'good',
  navigationType: 'navigate',
};

assert.deepEqual(normalizeWebVitalMetric(validMetric), validMetric);
assert.equal(normalizeWebVitalMetric({ ...validMetric, value: -1 }), null);
assert.equal(normalizeWebVitalMetric({ ...validMetric, value: 700_000 }), null);
assert.equal(normalizeWebVitalMetric({ ...validMetric, name: 'FID' }), null);
assert.equal(normalizeWebVitalMetric({ ...validMetric, navigationType: 'external-url' }), null);
assert.deepEqual(normalizeWebVitalsPayload({ metrics: [validMetric] }), [validMetric]);
assert.equal(normalizeWebVitalsPayload({ metrics: [validMetric, validMetric] }), null);
assert.equal(normalizeWebVitalsPayload({ metrics: [] }), null);

const captured: ServerWebVitalMetric[] = [];
const app = express();
app.use(express.json({ limit: '8kb' }));
app.use('/api', createWebVitalsRouter({
  capture(metric) {
    captured.push(metric);
    return true;
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/telemetry/web-vitals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics: [validMetric] }),
  });
  assert.equal(response.status, 204);
  assert.deepEqual(captured, [validMetric]);

  const invalid = await fetch(`http://127.0.0.1:${address.port}/api/telemetry/web-vitals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics: [{ ...validMetric, value: 'secret' }] }),
  });
  assert.equal(invalid.status, 400);
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('Web Vitals route tests passed');
