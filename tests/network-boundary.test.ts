import assert from 'node:assert/strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  configureLoopbackProxyTrust,
  corsOriginAllowed,
  getTrustedClientIp,
} from '../server/networkBoundary.js';

assert.equal(corsOriginAllowed(
  'https://arena.hs-manacost.ru',
  'https://arena.hs-manacost.ru',
  false,
), true);
assert.equal(corsOriginAllowed(
  'http://arena.hs-manacost.ru',
  'https://arena.hs-manacost.ru',
  false,
), false);
assert.equal(corsOriginAllowed(
  'http://localhost:3000',
  'https://arena.hs-manacost.ru',
  false,
), false);
assert.equal(corsOriginAllowed(
  'http://localhost:3000',
  'https://arena.hs-manacost.ru',
  true,
), true);
assert.equal(corsOriginAllowed(
  'https://localhost:3000',
  'https://arena.hs-manacost.ru',
  true,
), false);
assert.equal(corsOriginAllowed('not an origin', 'https://arena.hs-manacost.ru', true), false);

const app = express();
configureLoopbackProxyTrust(app);
app.get('/client-ip', (req, res) => res.json({ ip: getTrustedClientIp(req), expressIp: req.ip }));
app.use('/limited', rateLimit({
  windowMs: 60_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.ip === '127.0.0.1' || req.ip === '::1',
}));
app.get('/limited', (_req, res) => res.json({ ok: true }));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/client-ip`;

  const direct = await fetch(endpoint);
  assert.equal(direct.status, 200);
  assert.equal((await direct.json()).ip, '127.0.0.1');

  const proxied = await fetch(endpoint, { headers: { 'X-Forwarded-For': '203.0.113.20' } });
  assert.equal(proxied.status, 200);
  assert.deepEqual(await proxied.json(), { ip: '203.0.113.20', expressIp: '203.0.113.20' });

  const spoofedLeftMost = await fetch(endpoint, {
    headers: { 'X-Forwarded-For': '198.51.100.7, 203.0.113.20' },
  });
  assert.equal(spoofedLeftMost.status, 200);
  assert.deepEqual(await spoofedLeftMost.json(), { ip: '203.0.113.20', expressIp: '203.0.113.20' });

  const firstLimited = await fetch(`${endpoint.replace('/client-ip', '/limited')}`, {
    headers: { 'X-Forwarded-For': '198.51.100.7, 203.0.113.21' },
  });
  assert.equal(firstLimited.status, 200);
  const spoofAttempt = await fetch(`${endpoint.replace('/client-ip', '/limited')}`, {
    headers: { 'X-Forwarded-For': '192.0.2.44, 203.0.113.21' },
  });
  assert.equal(spoofAttempt.status, 429);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('network trust boundary tests passed');
