import assert from 'node:assert/strict';
import http from 'node:http';
import { runProductionMonitor } from '../scripts/production-monitor.mjs';

let livenessAttempts = 0;
let dataFresh = true;
let unknownCardStatus = 404;
let partialKnownFormat = null;
let mismatchEnvelopeFormat = null;

function cardHeaders(format) {
  const lkg = format === 'wild';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Data-Cache': lkg ? 'LKG' : 'fresh',
    'X-Dataset-Version': `ccc1-sha256:${format === 'wild' ? '2'.repeat(64) : '1'.repeat(64)}`,
  };
  if (lkg && mismatchEnvelopeFormat !== format) headers.Warning = '110 - "Response is Stale"';
  return headers;
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://monitor.test');
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
      datasets: ['winrates', 'tierlist', 'legendaries', 'constructed-cards-standard', 'constructed-cards-wild'].map(name => ({
        name,
        state: dataFresh ? 'fresh' : 'stale',
        records: 1,
      })),
    }));
    return;
  }
  if (requestUrl.pathname === '/api/constructed-cards') {
    const format = requestUrl.searchParams.get('format') || 'standard';
    const datasetVersion = `ccc1-sha256:${format === 'wild' ? '2'.repeat(64) : '1'.repeat(64)}`;
    res.writeHead(200, cardHeaders(format));
    res.end(JSON.stringify({
      format,
      datasetVersion,
      dataStatus: format === 'wild' && mismatchEnvelopeFormat !== format ? 'stale' : 'fresh',
      partial: false,
      cards: [{ card_id: `${format.toUpperCase()}_CARD_1` }],
    }));
    return;
  }
  if (/^\/api\/constructed-cards\/(?:STANDARD|WILD)_CARD_1$/.test(requestUrl.pathname)) {
    const format = requestUrl.searchParams.get('format') || 'standard';
    const cardId = requestUrl.pathname.split('/').pop();
    const datasetVersion = `ccc1-sha256:${format === 'wild' ? '2'.repeat(64) : '1'.repeat(64)}`;
    res.writeHead(200, cardHeaders(format));
    res.end(JSON.stringify({
      dataStatus: format === 'wild' && mismatchEnvelopeFormat !== format ? 'stale' : 'fresh',
      datasetVersion,
      partial: partialKnownFormat === format,
      card: { card_id: cardId },
    }));
    return;
  }
  if (requestUrl.pathname === '/api/constructed-cards/MANACOST_MONITOR_ABSENT_CARD') {
    res.writeHead(unknownCardStatus, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: unknownCardStatus === 404 ? 'Карта не найдена' : 'Ошибка' }));
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
  assert.equal(report.checks.length, 12);
  assert.equal(report.checks[0].attempts, 2);
  assert.deepEqual(report.checks.map(check => check.status), [200, 200, 200, 200, 200, 404, 200, 200, 404, 200, 200, 200]);

  partialKnownFormat = 'wild';
  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /known detail is partial/i,
  );
  partialKnownFormat = null;

  mismatchEnvelopeFormat = 'wild';
  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /LKG.*stale|Warning 110/i,
  );
  mismatchEnvelopeFormat = null;

  unknownCardStatus = 500;
  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /constructed cards standard unknown: HTTP 500/,
  );
  unknownCardStatus = 404;

  dataFresh = false;
  await assert.rejects(
    runProductionMonitor({ baseUrl, attempts: 1, retryDelayMs: 0, timeoutMs: 2_000 }),
    /data freshness: HTTP 503/,
  );
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('production monitor tests passed');
