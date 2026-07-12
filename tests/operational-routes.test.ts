import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { createOperationalRouter } from '../server/operationalRoutes.js';

const middlewareTrace: string[] = [];
const guard: RequestHandler = (request, response, next) => {
  middlewareTrace.push('guard');
  if (request.headers['x-scrape-key'] !== 'allowed') return response.status(403).json({ error: 'forbidden' });
  return next();
};
const limiter: RequestHandler = (_request, response, next) => {
  middlewareTrace.push('limiter');
  response.set('X-Test-Limiter', 'applied');
  next();
};
const queue: RequestHandler = (_request, response) => {
  middlewareTrace.push('queue');
  response.status(202).json({ queued: true });
};

const app = express();
app.use('/api', createOperationalRouter({
  loadDataset: filename => filename === 'winrates.json'
    ? { data: { updatedAt: '2026-07-12T12:00:00.000Z', source: 'firestone' }, mtime: 100 }
    : { data: { updatedAt: '2026-07-12T13:00:00.000Z', source: 'heartharena' }, mtime: 200 },
  authenticate: request => {
    const id = String(request.headers['x-test-user'] || '');
    return id ? { id } : null;
  },
  isAdmin: user => user?.id === 'admin',
  getClientIp: request => String(request.headers['x-test-ip'] || '127.0.0.1'),
  scrapeGuard: guard,
  scrapeLimiter: limiter,
  scrapeQueueHandler: queue,
  publicCacheHeader: 'public, max-age=300, stale-while-revalidate=300',
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api`;

try {
  const status = await fetch(`${origin}/status`);
  assert.equal(status.status, 200);
  assert.match(status.headers.get('cache-control') || '', /^public/);
  assert.equal(status.headers.get('etag'), '"status-2s-5k"');
  assert.deepEqual(await status.json(), {
    winrates: { updatedAt: '2026-07-12T12:00:00.000Z', source: 'firestone' },
    tierlist: { updatedAt: '2026-07-12T13:00:00.000Z', source: 'heartharena' },
    nextScrape: 'каждые 6 часов',
  });

  const notModified = await fetch(`${origin}/status`, { headers: { 'If-None-Match': '"status-2s-5k"' } });
  assert.equal(notModified.status, 304);

  const anonymousCheck = await fetch(`${origin}/check-ip`, { headers: { 'X-Test-IP': '203.0.113.7' } });
  assert.deepEqual(await anonymousCheck.json(), { allowed: false, id: null, ip: '203.0.113.7' });
  assert.equal(anonymousCheck.headers.get('cache-control'), 'no-store');
  assert.match(anonymousCheck.headers.get('vary') || '', /Cookie/);
  assert.match(anonymousCheck.headers.get('vary') || '', /Authorization/);

  const adminCheck = await fetch(`${origin}/check-ip`, { headers: { 'X-Test-User': 'admin' } });
  assert.deepEqual(await adminCheck.json(), { allowed: true, id: 'admin', ip: '127.0.0.1' });

  middlewareTrace.length = 0;
  const deniedScrape = await fetch(`${origin}/scrape`, { method: 'POST' });
  assert.equal(deniedScrape.status, 403);
  assert.deepEqual(middlewareTrace, ['guard']);

  middlewareTrace.length = 0;
  const queuedScrape = await fetch(`${origin}/scrape`, {
    method: 'POST',
    headers: { 'X-Scrape-Key': 'allowed' },
  });
  assert.equal(queuedScrape.status, 202);
  assert.equal(queuedScrape.headers.get('x-test-limiter'), 'applied');
  assert.deepEqual(await queuedScrape.json(), { queued: true });
  assert.deepEqual(middlewareTrace, ['guard', 'limiter', 'queue']);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('operational router contract tests passed');
