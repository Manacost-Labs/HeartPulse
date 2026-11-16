import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import {
  createSubscriptionAnalyticsRouter,
  createSubscriptionMetricsLoader,
} from '../server/modules/subscriptionAnalytics/public.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/boosty-subscription-metrics-sample-20261111.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const UPSTREAM_ERROR = { error: 'Не удалось загрузить аналитику подписок', source: 'unavailable' };
const firstOf = (key: string) => (sample[key] as Array<Record<string, unknown>>)[0];

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}
const close = (server: Server) => new Promise<void>((resolve, reject) => {
  server.closeAllConnections?.();
  server.close(error => (error ? reject(error) : resolve()));
});

describe('GET /api/admin/boosty/subscription-metrics', () => {
  /** Фейковый boosty-auth: мокается только внешняя граница. */
  let upstream: Server;
  let upstreamPort = 0;
  let upstreamUrls: string[] = [];
  let upstreamReply: (request: IncomingMessage, response: ServerResponse) => void;
  let app: Server;
  let endpoint = '';
  const timeoutMs = 300;

  before(async () => {
    upstream = createServer((request, response) => {
      upstreamUrls.push(request.url ?? '');
      upstreamReply(request, response);
    });
    upstreamPort = await listen(upstream);
    const router = createSubscriptionAnalyticsRouter({
      adminAuth: request => (request.headers['x-admin'] === 'yes' ? { id: 'admin' } : null),
      setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
      loadMetrics: createSubscriptionMetricsLoader({ boostyBaseUrl: `http://127.0.0.1:${upstreamPort}/`, timeoutMs }),
    });
    const express_ = express();
    express_.use('/api', router);
    app = express_.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => app.once('listening', resolve));
    endpoint = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/admin/boosty/subscription-metrics`;
  });
  after(async () => {
    await close(app);
    await close(upstream);
  });
  beforeEach(() => {
    upstreamUrls = [];
    upstreamReply = (_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(sample));
    };
  });

  const asAdmin = (query = '') => fetch(`${endpoint}${query}`, { headers: { 'X-Admin': 'yes' } });

  it('отдаёт админу контракт; Cache-Control private и no-store', async () => {
    const response = await asAdmin('?days=92');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /private/);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const body = await response.json() as typeof sample & { summary: { paidNow: number } };
    assert.deepEqual(body, sample);
    assert.equal(body.summary.paidNow, 414);
  });

  it('не-админу и анониму — 403 с тем же no-store, источник не вызывается', async () => {
    const anonymous = await fetch(endpoint);
    const other = await fetch(`${endpoint}?days=30`, { headers: { 'X-Admin': 'no' } });
    for (const response of [anonymous, other]) {
      assert.equal(response.status, 403);
      assert.match(response.headers.get('cache-control') ?? '', /private.*no-store|no-store.*private/);
      assert.deepEqual(await response.json(), { error: 'Недостаточно прав' });
    }
    assert.deepEqual(upstreamUrls, []);
  });

  it('days вне 1..366 или не число — 400 с no-store, источник не вызывается', async () => {
    for (const query of ['?days=0', '?days=367', '?days=abc', '?days=', '?days=1.5', '?days=-3', '?days=1&days=2', '?days[x]=1']) {
      const response = await asAdmin(query);
      assert.equal(response.status, 400, query);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      assert.match(((await response.json()) as { error: string }).error, /days/);
    }
    assert.deepEqual(upstreamUrls, []);
  });

  it('наверх уходит только days: по умолчанию 92, без from и to', async () => {
    await asAdmin();
    await asAdmin('?days=366&from=2026-01-01&to=2026-02-01');
    await asAdmin('?days=1');
    assert.deepEqual(upstreamUrls, [
      '/api/analytics/subscriptions?days=92',
      '/api/analytics/subscriptions?days=366',
      '/api/analytics/subscriptions?days=1',
    ]);
  });

  it('источник недоступен, 500, не JSON или чужая версия — 502 unavailable', async () => {
    const cases: Array<[string, (response: ServerResponse) => void, boolean]> = [
      ['500', response => { response.statusCode = 500; response.end('boom http://127.0.0.1:18082 secret'); }, false],
      ['не JSON', response => { response.end('<html>'); }, false],
      ['schemaVersion 2', response => { response.end(JSON.stringify({ ...sample, schemaVersion: 2 })); }, true],
      ['чужая semantics', response => { response.end(JSON.stringify({ ...sample, semantics: 'observed_cumulative_delta' })); }, true],
      ['не объект', response => { response.end('[]'); }, false],
      ['сломанное поле', response => { response.end(JSON.stringify({ ...sample, summary: { paidNow: '414' } })); }, false],
      ['несуществующий день', response => { response.end(JSON.stringify({ ...sample, daily: [{ ...firstOf('daily'), date: '2026-02-30' }] })); }, false],
      ['несуществующий месяц', response => { response.end(JSON.stringify({ ...sample, months: [{ ...firstOf('months'), month: '2026-13' }] })); }, false],
      ['несуществующая неделя', response => { response.end(JSON.stringify({ ...sample, weekly: [{ ...firstOf('weekly'), weekStart: '2026-00-10' }] })); }, false],
    ];
    for (const [name, reply, incompatible] of cases) {
      upstreamReply = (_request, response) => reply(response);
      const response = await asAdmin('?days=92');
      assert.equal(response.status, 502, name);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      const body = await response.json();
      assert.deepEqual(body, incompatible ? { ...UPSTREAM_ERROR, reason: 'incompatible' } : UPSTREAM_ERROR, name);
      assert.doesNotMatch(JSON.stringify(body), /secret|127\.0\.0\.1|boom/);
    }
  });

  it('молчащий источник — 502 не позже таймаута (с запасом)', async () => {
    upstreamReply = () => { /* не отвечает */ };
    const startedAt = Date.now();
    const response = await asAdmin('?days=92');
    const elapsed = Date.now() - startedAt;
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), UPSTREAM_ERROR);
    assert.ok(elapsed >= timeoutMs - 50 && elapsed < timeoutMs + 1500, `ответ за ${elapsed} мс`);
  });

  it('источник оборвал соединение — 502', async () => {
    upstreamReply = (request) => { request.socket.destroy(); };
    const response = await asAdmin();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), UPSTREAM_ERROR);
  });

  it('лишнее поле источника на любом уровне в ответ не попадает', async () => {
    const leaky = {
      ...sample,
      subscribers_leak: [{ email: 'leak@example.com', userId: 'LEAK42' }],
      summary: { ...(sample.summary as object), email: 'leak@example.com' },
      daily: (sample.daily as Array<Record<string, unknown>>).map(day => ({ ...day, leak_names: ['LEAKNAME'] })),
    };
    upstreamReply = (_request, response) => { response.end(JSON.stringify(leaky)); };
    const response = await asAdmin();
    assert.equal(response.status, 200);
    const text = JSON.stringify(await response.json());
    assert.doesNotMatch(text, /leak|LEAK/i);
  });
});
