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
  normalizeWebVitalPage,
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

const lcpMetric: ServerWebVitalMetric = {
  name: 'LCP',
  value: 2140,
  rating: 'good',
  navigationType: 'prerender',
  lcpTarget: 'img.constructed-card-detail__visual-button',
};
const cardPage = { route: '/standard/cards/[format]/[cardId]/', device: 'mobile' } as const;
const unknownPage = { route: 'unknown', device: 'unknown' } as const;

assert.deepEqual(normalizeWebVitalMetric(validMetric), validMetric);
assert.deepEqual(normalizeWebVitalMetric(lcpMetric), lcpMetric);
assert.equal(normalizeWebVitalMetric({ ...validMetric, value: -1 }), null);
assert.equal(normalizeWebVitalMetric({ ...validMetric, value: 700_000 }), null);
assert.equal(normalizeWebVitalMetric({ ...validMetric, name: 'FID' }), null);
assert.equal(normalizeWebVitalMetric({ ...validMetric, navigationType: 'external-url' }), null);
assert.equal(normalizeWebVitalMetric({ ...validMetric, lcpTarget: 'img.hero' }), null,
  'only LCP carries an element descriptor');
for (const lcpTarget of ['img.card art', 'h1#Leeroy', 'p.Leeroy Jenkins', 'img.card-12345', `img.${'a'.repeat(60)}`, 42]) {
  assert.equal(normalizeWebVitalMetric({ ...lcpMetric, lcpTarget }), null, String(lcpTarget));
}
const { lcpTarget: _target, ...lcpWithoutTarget } = lcpMetric;
assert.deepEqual(normalizeWebVitalMetric(lcpWithoutTarget), lcpWithoutTarget,
  'a report from a page opened before the release has no descriptor');

assert.deepEqual(normalizeWebVitalPage({ ...cardPage, metrics: [] }), cardPage);
assert.deepEqual(normalizeWebVitalPage({ route: 'other', device: 'desktop' }), { route: 'other', device: 'desktop' });
assert.deepEqual(normalizeWebVitalPage({}), unknownPage, 'reports from older pages stay accepted');
for (const route of [
  '/standard/cards/standard/CARD_QA_0002/',
  '/?utm_source=telegram',
  '/standard/cards/[format]/[cardId]',
  'unknown',
  'x'.repeat(5000),
  ['/'],
  null,
]) {
  assert.equal(normalizeWebVitalPage({ route, device: 'mobile' }), null, `route ${String(route).slice(0, 40)}`);
}
for (const device of ['tablet', 'Mozilla/5.0 (iPhone)', 'unknown', '', 0]) {
  assert.equal(normalizeWebVitalPage({ route: '/', device }), null, `device ${String(device)}`);
}

assert.deepEqual(normalizeWebVitalsPayload({ ...cardPage, metrics: [validMetric, lcpMetric] }),
  { page: cardPage, metrics: [validMetric, lcpMetric] });
assert.deepEqual(normalizeWebVitalsPayload({ metrics: [validMetric] }), { page: unknownPage, metrics: [validMetric] });
assert.equal(normalizeWebVitalsPayload({ metrics: [validMetric, validMetric] }), null);
assert.equal(normalizeWebVitalsPayload({ metrics: [] }), null);
assert.equal(normalizeWebVitalsPayload({ route: '/heroes/57421/', device: 'mobile', metrics: [validMetric] }), null);
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
  ...cardPage,
}), {
  rating: 'good',
  navigation_type: 'navigate',
  edge_region: 'ru-moscow',
  client_region: 'russia',
  route: '/standard/cards/[format]/[cardId]/',
  device: 'mobile',
});
assert.deepEqual(webVitalMetricAttributes(lcpMetric, {
  edgeRegion: 'ru-novosibirsk',
  clientRegion: 'russia',
  route: '/',
  device: 'desktop',
}), {
  rating: 'good',
  navigation_type: 'prerender',
  edge_region: 'ru-novosibirsk',
  client_region: 'russia',
  route: '/',
  device: 'desktop',
  lcp_target: 'img.constructed-card-detail__visual-button',
});
assert.equal(webVitalMetricAttributes(lcpWithoutTarget, {
  edgeRegion: 'origin',
  clientRegion: 'unknown',
  ...unknownPage,
}).lcp_target, 'unknown');

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
    body: JSON.stringify({ ...cardPage, metrics: [validMetric] }),
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-rum-edge-region'), 'ru-novosibirsk');
  assert.equal(response.headers.get('x-rum-client-region'), 'russia');
  assert.deepEqual(captured, [{
    metric: validMetric,
    context: { edgeRegion: 'ru-novosibirsk', clientRegion: 'russia', ...cardPage },
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
    context: { edgeRegion: 'unknown', clientRegion: 'unknown', ...unknownPage },
  });

  const capturedBeforeRawPath = captured.length;
  const rawPath = await fetch(`http://127.0.0.1:${address.port}/api/telemetry/web-vitals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: '/id/a1b2c3d4/?token=secret', device: 'mobile', metrics: [validMetric] }),
  });
  assert.equal(rawPath.status, 400, 'a raw path never reaches the metrics backend');
  assert.equal(captured.length, capturedBeforeRawPath);

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
