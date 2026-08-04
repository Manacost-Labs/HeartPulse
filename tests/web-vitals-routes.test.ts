import assert from 'node:assert/strict';
import express from 'express';
import {
  createWebVitalsRouter,
  normalizeWebVitalMetric,
  normalizeWebVitalsPayload,
} from '../server/webVitalsRoutes.js';
import {
  normalizeWebVitalClientRegion,
  normalizeWebVitalEdgeRegion,
  type ServerWebVitalContext,
  type ServerWebVitalMetric,
  webVitalMetricAttributes,
} from '../server/webVitalsModel.js';

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
assert.equal(normalizeWebVitalEdgeRegion('ru-moscow'), 'ru-moscow');
assert.equal(normalizeWebVitalEdgeRegion('ru-novosibirsk'), 'ru-novosibirsk');
assert.equal(normalizeWebVitalEdgeRegion('attacker-controlled'), 'unknown');
assert.equal(normalizeWebVitalEdgeRegion(['ru-moscow', 'ru-novosibirsk']), 'unknown');
assert.equal(normalizeWebVitalClientRegion('russia'), 'russia');
assert.equal(normalizeWebVitalClientRegion('north-america'), 'north-america');
assert.equal(normalizeWebVitalClientRegion('asia'), 'asia');
assert.equal(normalizeWebVitalClientRegion('attacker-controlled'), 'unknown');
assert.equal(normalizeWebVitalClientRegion(['europe', 'asia']), 'unknown');
assert.deepEqual(webVitalMetricAttributes(validMetric, {
  edgeRegion: 'ru-moscow',
  clientRegion: 'russia',
}), {
  rating: 'good',
  navigation_type: 'navigate',
  edge_region: 'ru-moscow',
  client_region: 'russia',
});

const captured: Array<{ metric: ServerWebVitalMetric; context: ServerWebVitalContext }> = [];
const app = express();
app.use(express.json({ limit: '8kb' }));
app.use('/api', createWebVitalsRouter({
  capture(metric, context) {
    captured.push({ metric, context });
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
    headers: {
      'Content-Type': 'application/json',
      'X-Arena-Edge-Region': 'ru-novosibirsk',
      'X-Arena-Client-Region': 'russia',
    },
    body: JSON.stringify({ metrics: [validMetric] }),
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-rum-edge-region'), 'ru-novosibirsk');
  assert.equal(response.headers.get('x-rum-client-region'), 'russia');
  assert.deepEqual(captured, [{
    metric: validMetric,
    context: { edgeRegion: 'ru-novosibirsk', clientRegion: 'russia' },
  }]);

  const missingRegion = await fetch(`http://127.0.0.1:${address.port}/api/telemetry/web-vitals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics: [validMetric] }),
  });
  assert.equal(missingRegion.status, 204);
  assert.equal(missingRegion.headers.get('x-rum-edge-region'), 'unknown');
  assert.equal(missingRegion.headers.get('x-rum-client-region'), 'unknown');
  assert.deepEqual(captured.at(-1), {
    metric: validMetric,
    context: { edgeRegion: 'unknown', clientRegion: 'unknown' },
  });

  const invalid = await fetch(`http://127.0.0.1:${address.port}/api/telemetry/web-vitals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Arena-Edge-Region': 'attacker-controlled',
      'X-Arena-Client-Region': 'attacker-controlled',
    },
    body: JSON.stringify({ metrics: [{ ...validMetric, value: 'secret' }] }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('x-rum-edge-region'), 'unknown');
  assert.equal(invalid.headers.get('x-rum-client-region'), 'unknown');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('Web Vitals route tests passed');
