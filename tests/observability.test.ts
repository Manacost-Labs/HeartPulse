import assert from 'node:assert/strict';
import express from 'express';
import {
  normalizeRequestPath,
  requestIdFromHeader,
  requestLoggingMiddleware,
  structuredErrorMiddleware,
} from '../server/observability.js';

assert.equal(requestIdFromHeader('client-request-1'), 'client-request-1');
assert.match(requestIdFromHeader('invalid request id'), /^[0-9a-f-]{36}$/);
assert.equal(normalizeRequestPath('/api/users/123?token=secret'), '/api/users/:id');
assert.equal(normalizeRequestPath('/reset/a'.padEnd(45, 'a')), '/reset/:token');
assert.equal(normalizeRequestPath('/profile/person@example.test'), '/profile/:value');

const lines: string[] = [];
const writer = (line: string) => lines.push(line);
const app = express();
app.use(requestLoggingMiddleware(writer));
app.get('/ok/:id', (req, res) => res.json({ ok: true, id: req.params.id }));
app.get('/failure', (_req, _res, next) => {
  const error = Object.assign(new Error('email qa@example.test token=secret'), { code: 'UPSTREAM_TIMEOUT' });
  next(error);
});
app.use(structuredErrorMiddleware(writer));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const okResponse = await fetch(`${origin}/ok/123?token=secret&email=qa@example.test`, {
    headers: {
      authorization: 'Bearer super-secret',
      cookie: 'session=super-secret',
      'x-request-id': 'qa-request-123',
    },
  });
  assert.equal(okResponse.status, 200);
  assert.equal(okResponse.headers.get('x-request-id'), 'qa-request-123');

  const failureResponse = await fetch(`${origin}/failure`);
  assert.equal(failureResponse.status, 500);
  const failureBody = await failureResponse.json();
  assert.match(failureBody.requestId, /^[0-9a-f-]{36}$/);

  await new Promise(resolve => setTimeout(resolve, 0));
  const records = lines.map(line => JSON.parse(line));
  const okRecord = records.find(record => record.event === 'http_request' && record.requestId === 'qa-request-123');
  assert.ok(okRecord);
  assert.equal(okRecord.route, '/ok/:id');
  assert.equal(okRecord.status, 200);
  assert.equal(typeof okRecord.durationMs, 'number');

  const errorRecord = records.find(record => record.event === 'http_request_error');
  assert.ok(errorRecord);
  assert.equal(errorRecord.errorCode, 'UPSTREAM_TIMEOUT');
  assert.equal(errorRecord.requestId, failureBody.requestId);
  assert.ok(records.some(record => record.event === 'http_request' && record.status === 500));

  const serialized = lines.join('\n');
  for (const forbidden of ['super-secret', 'qa@example.test', 'token=secret', 'authorization', 'cookie']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, 'i'));
  }
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('structured observability tests passed');
