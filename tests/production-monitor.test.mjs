import assert from 'node:assert/strict';
import http from 'node:http';
import { runProductionMonitor } from '../scripts/production-monitor.mjs';

let livenessAttempts = 0;
let dataFresh = true;

const server = http.createServer((req, res) => {
  if (req.url === '/api/health/live') {
    livenessAttempts += 1;
    if (livenessAttempts === 1) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: 'starting' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'alive', release: 'abcdef1234567890' }));
    return;
  }
  if (req.url === '/api/health/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'ready', dataStatus: 'ok' }));
    return;
  }
  if (req.url === '/api/health/data') {
    res.writeHead(dataFresh ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      status: dataFresh ? 'ok' : 'degraded',
      fresh: dataFresh,
      datasets: ['winrates', 'tierlist', 'legendaries'].map(name => ({
        name,
        state: dataFresh ? 'fresh' : 'stale',
        records: 1,
      })),
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><body><main>HS Arena</main></body></html>');
});

server.listen(0, '127.0.0.1');
await new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const report = await runProductionMonitor({ baseUrl, attempts: 2, retryDelayMs: 0, timeoutMs: 2_000 });
  assert.equal(report.status, 'ok');
  assert.equal(report.checks.length, 6);
  assert.equal(report.checks[0].attempts, 2);
  assert.deepEqual(report.checks.map(check => check.status), [200, 200, 200, 200, 200, 200]);

  dataFresh = false;
  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /data freshness: HTTP 503/,
  );
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('production monitor tests passed');
