import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSafeSourceUrl,
  collectSource,
  createDocumentCollector,
  readResponseBody,
} from '../server/modules/gameDataAudit/repository.js';

test('network boundary accepts allowlisted HTTPS and loopback only', () => {
  assert.doesNotThrow(() => assertSafeSourceUrl('https://db.kolodahs.ru/api/v1/cards', ['db.kolodahs.ru']));
  assert.doesNotThrow(() => assertSafeSourceUrl('http://127.0.0.1:18081/v1/system/health', ['127.0.0.1']));
  assert.throws(() => assertSafeSourceUrl('http://db.kolodahs.ru/api/v1/cards', ['db.kolodahs.ru']), /HTTPS/);
  assert.throws(() => assertSafeSourceUrl('https://evil.example/cards', ['db.kolodahs.ru']), /allowlist/);
  assert.throws(() => assertSafeSourceUrl('http://169.254.169.254/latest/meta-data', ['169.254.169.254']), /loopback/);
});

test('response reader rejects oversized bodies', async () => {
  const response = new Response('1234567890');
  await assert.rejects(readResponseBody(response, 5), /maximum size/);
});

test('document collector follows Scrape.do, Firecrawl, Scrapfly order', async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('https://api.scrape.do')) return new Response('no', { status: 502 });
    if (url.startsWith('https://api.firecrawl.dev')) return new Response(JSON.stringify({ success: false }), { status: 502 });
    assert.equal(init?.method, 'GET');
    return new Response(JSON.stringify({ result: { content: '<h1>Patch 36.2.0</h1>' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const collect = createDocumentCollector({
    fetchImpl,
    env: {
      SCRAPE_DO_TOKEN: 'scrape-secret',
      FIRECRAWL_API_KEYS: 'fire-secret',
      SCRAPFLY_API_KEY: 'fly-secret',
    },
  });
  const result = await collect('https://hearthstone.blizzard.com/en-us/news/patchnotes', {
    timeoutMs: 2_000,
    maxBytes: 20_000,
  });

  assert.deepEqual(calls.map(url => new URL(url).hostname), [
    'api.scrape.do',
    'api.firecrawl.dev',
    'api.scrapfly.io',
  ]);
  assert.equal(result.provider, 'scrapfly');
  assert.match(result.content, /Patch 36\.2\.0/);
  assert.equal(calls.some(url => url.includes('fire-secret')), false, 'Bearer keys must not be written into URLs');
});

test('document collector rotates all Firecrawl keys before Scrapfly', async () => {
  const authHeaders: string[] = [];
  const collect = createDocumentCollector({
    env: { FIRECRAWL_API_KEYS: 'first-key,second-key', SCRAPFLY_API_KEY: 'unused' },
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.includes('firecrawl')) {
        authHeaders.push(new Headers(init?.headers).get('authorization') ?? '');
        if (authHeaders.length === 1) return new Response('{}', { status: 429 });
        return new Response(JSON.stringify({ data: { markdown: 'Patch 36.2.0' } }), { status: 200 });
      }
      throw new Error('Scrapfly must not run after the second Firecrawl key succeeds');
    },
  });

  const result = await collect('https://hearthstone.blizzard.com/en-us/news/patchnotes', {
    timeoutMs: 2_000,
    maxBytes: 20_000,
  });
  assert.equal(result.provider, 'firecrawl');
  assert.deepEqual(authHeaders, ['Bearer first-key', 'Bearer second-key']);
});

test('structured health payload is inspected even when degraded endpoint returns 503', async () => {
  const result = await collectSource({
    id: 'arena-health', label: 'Arena', kind: 'json', role: 'health',
    url: 'https://arena.hs-manacost.ru/api/health/data',
    allowedHosts: ['arena.hs-manacost.ru'], required: true,
    recordsPath: 'datasets', profile: 'arenaHealth',
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      ready: true,
      datasets: [{ name: 'cards', state: 'stale', requiredForReadiness: true }],
    }), { status: 503, headers: { 'content-type': 'application/json' } }),
  });

  assert.equal(result.issues[0]?.code, 'REQUIRED_DATASET_STALE');
  assert.equal(result.issues.some(item => item.code === 'FETCH_FAILED'), false);
});

test('parser-control audits every source and treats a protected LKG as lag, not data loss', async () => {
  const result = await collectSource({
    id: 'parser-control', label: 'Parsers', kind: 'json', role: 'statistics',
    url: 'http://127.0.0.1:18081/admin/parser-control', allowedHosts: ['127.0.0.1'],
    required: false, profile: 'parserControl', minRecords: 2,
  }, {
    env: {},
    fetchImpl: async () => new Response(JSON.stringify({
      sections: {
        battlegrounds: { sources: [
          { source_id: 'heroes', state: 'ok', item_count: 120, last_success_at: '2026-08-07T01:00:00Z' },
          { source_id: 'strategies', state: 'fetch_error', stable_baseline_available: true, item_count: 30 },
        ] },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  assert.equal(result.recordCount, 2);
  assert.equal(result.issues[0]?.code, 'PARSER_SOURCE_STALE');
  assert.equal(result.issues.some(item => item.severity === 'error'), false);
});

test('pagination guard reports truncation instead of silently hashing a partial catalog', async () => {
  const result = await collectSource({
    id: 'cards', label: 'Cards', kind: 'json', role: 'catalog',
    url: 'https://db.kolodahs.ru/api/v1/cards', allowedHosts: ['db.kolodahs.ru'],
    required: true, recordsPath: 'data', profile: 'generic',
    pagination: { perPage: 1, maxPages: 1 },
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      data: [{ card_id: 'ONE' }],
      pagination: { page: 1, total: 2, total_pages: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  assert.equal(result.issues[0]?.code, 'PAGINATION_TRUNCATED');
  assert.equal(result.ok, false);
});

test('malformed record list cannot pass by advertising a large pagination total', async () => {
  const result = await collectSource({
    id: 'cards', label: 'Cards', kind: 'json', role: 'catalog',
    url: 'https://db.kolodahs.ru/api/v1/cards', allowedHosts: ['db.kolodahs.ru'],
    required: true, recordsPath: 'data', profile: 'generic', minRecords: 1_000,
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      data: 'not-an-array',
      pagination: { total: 10_000, total_pages: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  assert.equal(result.issues.some(item => item.code === 'MALFORMED_SOURCE_SCHEMA'), true);
  assert.equal(result.ok, false);
});
