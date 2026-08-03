import assert from 'node:assert/strict';
import express from 'express';
import {
  createClientErrorRouter,
  normalizeClientInterfaceIncident,
  type ClientInterfaceIncident,
} from '../server/clientErrorRoutes.js';

const rawIncident = {
  incidentId: '67eada58-6e5a-4468-9614-e11bac60ef47',
  kind: 'render',
  releaseId: '0122d4a206f26d78d6aafae91049484c87b143a9',
  route: '/admin?section=standard-data',
  scope: 'application-root',
  errorName: 'Error',
  message: 'Failed for https://example.test/path?token=secret and person@example.test',
  stack: 'Error: failure\n at Component (https://example.test/assets/app.js:1:2)',
  componentStack: 'at StandardOperationsLegacy',
};
const normalized = normalizeClientInterfaceIncident(rawIncident);
assert.ok(normalized);
assert.equal(normalized.route, '/admin');
assert.equal(normalized.message, 'Failed for [url] and [email]');
assert.doesNotMatch(normalized.stack, /example\.test/);
assert.equal(normalizeClientInterfaceIncident({ ...rawIncident, incidentId: 'not-an-incident' }), null);
assert.equal(normalizeClientInterfaceIncident({ ...rawIncident, releaseId: 'branch-name' }), null);

const captured: ClientInterfaceIncident[] = [];
const app = express();
app.use(express.json({ limit: '16kb' }));
app.use('/api', createClientErrorRouter({ capture: incident => captured.push(incident) }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/telemetry/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rawIncident),
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.incidentId, rawIncident.incidentId);

  const invalid = await fetch(`http://127.0.0.1:${address.port}/api/telemetry/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...rawIncident, kind: 'database' }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(captured.length, 1);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('Client interface incident route tests passed');
