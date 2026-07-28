import assert from 'node:assert/strict';
import express from 'express';
import {
  buildBoostyArticleAnalytics,
  createAdminBoostyAnalyticsRouter,
  createBoostyAnalyticsLoader,
  type BoostyAnalyticsSource,
  type KolodaArticle,
} from '../server/adminBoostyAnalyticsRoutes.js';

const source: BoostyAnalyticsSource = {
  schemaVersion: 1,
  semantics: 'observed_cumulative_delta',
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-10T00:00:00.000Z',
  summary: {
    newSubscriptions: 2,
    renewals: 1,
    revenueRub: 350,
    observedDecreaseRub: -50,
  },
  plans: [],
  observations: [
    {
      observedAt: '2026-07-02T12:00:00.000Z',
      type: 'new_subscription',
      amountRub: 100,
      planId: '100',
      planName: 'Любитель Арены',
      source: 'boosty',
    },
    {
      observedAt: '2026-07-06T12:00:00.000Z',
      type: 'observed_renewal',
      amountRub: 200,
      planId: '200',
      planName: 'Алмаз',
      source: 'boosty',
    },
    {
      observedAt: '2026-07-07T12:00:00.000Z',
      type: 'observed_decrease',
      amountRub: -50,
      planId: '200',
      planName: 'Алмаз',
      source: 'boosty',
    },
  ],
  retention: [
    { days: 7, eligible: 2, evaluated: 1, retained: 1, unknown: 1, rate: 100 },
  ],
  coverage: {
    baselineAt: '2026-07-01T00:00:00.000Z',
    lastAcceptedPollAt: '2026-07-09T23:58:00.000Z',
    acceptedPolls: 100,
    maxPollGapSeconds: 180,
    complete: true,
  },
};

const articles: KolodaArticle[] = [
  {
    id: 'one',
    title: 'Статья 1',
    url: 'https://kolodahearthstone.ru/one/',
    publishedAt: '2026-07-01T10:00:00.000Z',
  },
  {
    id: 'two',
    title: 'Статья 2',
    url: 'https://kolodahearthstone.ru/two/',
    publishedAt: '2026-07-05T10:00:00.000Z',
  },
];

const built = buildBoostyArticleAnalytics(
  source,
  articles,
  new Date('2026-07-01T00:00:00.000Z'),
  new Date('2026-07-10T00:00:00.000Z'),
);
assert.equal(built.articleIntervals.length, 2);
assert.deepEqual(built.articleIntervals[0].metrics, {
  newSubscriptions: 1,
  renewals: 0,
  revenueRub: 100,
  observedDecreaseRub: 0,
});
assert.deepEqual(built.articleIntervals[1].metrics, {
  newSubscriptions: 0,
  renewals: 1,
  revenueRub: 200,
  observedDecreaseRub: -50,
});
assert.deepEqual(built.articleIntervals[1].plans, [
  {
    planId: '200',
    planName: 'Алмаз',
    newSubscriptions: 0,
    renewals: 1,
    revenueRub: 200,
    source: 'boosty',
  },
]);

const tributeSource = {
  schemaVersion: 1,
  semantics: 'exact_webhook_events',
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-10T00:00:00.000Z',
  summary: {
    newSubscriptions: 1,
    renewals: 1,
    cancellations: 0,
    revenueRub: 300,
    observedDecreaseRub: 0,
  },
  plans: [
    {
      planId: 'tribute-200',
      planName: 'Tribute Алмаз',
      newSubscriptions: 1,
      renewals: 1,
      revenueRub: 300,
    },
  ],
  observations: [
    {
      observedAt: '2026-07-03T12:00:00.000Z',
      type: 'new_subscription',
      amountRub: 100,
      currency: 'RUB',
      planId: 'tribute-200',
      planName: 'Tribute Алмаз',
    },
    {
      observedAt: '2026-07-08T12:00:00.000Z',
      type: 'renewed_subscription',
      amountRub: 200,
      currency: 'RUB',
      planId: 'tribute-200',
      planName: 'Tribute Алмаз',
    },
  ],
  retention: [
    { days: 7, eligible: 1, evaluated: 1, retained: 1, unknown: 0, rate: 100 },
  ],
  coverage: {
    baselineAt: '2026-07-03T12:00:00.000Z',
    lastAcceptedPollAt: '2026-07-08T12:00:01.000Z',
    acceptedPolls: 2,
    maxPollGapSeconds: null,
    complete: true,
  },
  unsupportedRevenueCurrencies: [],
};

const requestedArticlePages: number[] = [];
const loader = createBoostyAnalyticsLoader({
  boostyBaseUrl: 'http://boosty.internal',
  kolodaEndpoint: 'https://kolodahearthstone.ru/wp-json/koloda/v1/articles/query',
  now: () => new Date('2026-07-10T01:00:00.000Z'),
  fetchImpl: (async (url, init) => {
    if (String(url).includes('/api/tribute/analytics')) {
      return new Response(JSON.stringify(tributeSource), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).includes('/api/analytics')) {
      return new Response(JSON.stringify(source), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = JSON.parse(String(init?.body || '{}')) as {
      page?: number;
      pageSize?: number;
    };
    assert.equal(body.pageSize, 50);
    const page = body.page ?? 1;
    requestedArticlePages.push(page);
    return new Response(JSON.stringify({
      data: [articles[page - 1]],
      pagination: { page, pageSize: 50, totalItems: 2, totalPages: 2 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch,
});
const loaded = await loader(
  new Date('2026-07-01T00:00:00.000Z'),
  new Date('2026-07-10T00:00:00.000Z'),
);
assert.deepEqual(requestedArticlePages.sort(), [1, 2]);
assert.equal(loaded.articleIntervals.length, 2);
assert.equal(loaded.summary.newSubscriptions, 2);
assert.equal(loaded.summary.renewals, 2);
assert.equal(loaded.sourceBreakdown.length, 2);
assert.equal(loaded.generatedAt, '2026-07-10T01:00:00.000Z');

const partialLoader = createBoostyAnalyticsLoader({
  boostyBaseUrl: 'http://boosty.internal',
  kolodaEndpoint: 'https://kolodahearthstone.ru/wp-json/koloda/v1/articles/query',
  fetchImpl: (async (url) => {
    if (String(url).includes('/api/tribute/analytics')) {
      return new Response('{}', { status: 503 });
    }
    if (String(url).includes('/api/analytics')) {
      return new Response(JSON.stringify(source), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      data: articles,
      pagination: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch,
});
const partial = await partialLoader(
  new Date('2026-07-01T00:00:00.000Z'),
  new Date('2026-07-10T00:00:00.000Z'),
);
assert.deepEqual(partial.sourceBreakdown.map(item => item.id), ['boosty']);
assert.equal(partial.coverage.complete, false);
assert.match(partial.limitations.join(' '), /Tribute временно недоступен/);

let loaderCalls = 0;
let loaderFailure = false;
const app = express();
app.use('/api', createAdminBoostyAnalyticsRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin' } : null,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  now: () => new Date('2026-07-10T00:00:00.000Z'),
  loadAnalytics: async (from, to) => {
    loaderCalls += 1;
    if (loaderFailure) throw new Error('http://127.0.0.1/private-token');
    return buildBoostyArticleAnalytics(source, articles, from, to);
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/admin/boosty/analytics`;

try {
  const denied = await fetch(endpoint);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');

  for (const query of [
    '?from=bad&to=2026-07-10T00:00:00Z',
    '?from=2026-07-10T00:00:00Z&to=2026-07-01T00:00:00Z',
    '?from=2025-01-01T00:00:00Z&to=2026-07-10T00:00:00Z',
  ]) {
    const invalid = await fetch(`${endpoint}${query}`, { headers: { 'X-Admin': 'yes' } });
    assert.equal(invalid.status, 400);
  }
  assert.equal(loaderCalls, 0);

  const ready = await fetch(
    `${endpoint}?from=2026-07-01T00:00:00Z&to=2026-07-10T00:00:00Z`,
    { headers: { 'X-Admin': 'yes' } },
  );
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get('cache-control'), 'private, no-store');
  assert.equal((await ready.json() as { articleIntervals: unknown[] }).articleIntervals.length, 2);
  assert.equal(loaderCalls, 1);

  loaderFailure = true;
  const failed = await fetch(endpoint, { headers: { 'X-Admin': 'yes' } });
  assert.equal(failed.status, 502);
  const failedPayload = await failed.json();
  assert.deepEqual(failedPayload, {
    error: 'Не удалось загрузить аналитику подписок',
    source: 'unavailable',
  });
  assert.doesNotMatch(JSON.stringify(failedPayload), /private|127\\.0\\.0\\.1|token/i);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin Boosty analytics router contract tests passed');
