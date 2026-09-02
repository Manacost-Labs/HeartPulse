import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ObserverConfigurationError,
  ObserverRunFailure,
  publicRoutePaths,
  runObserverChecks,
  sanitizeDiagnostic,
  validateObserverConfig,
} from '../scripts/production-observer/core.mjs';
import { createHttpRouteProbe } from '../scripts/production-observer/http-probe.mjs';
import { runProductionObserver } from '../scripts/production-observer.mjs';

const validConfig = {
  schemaVersion: 1,
  navigationTimeoutMs: 10_000,
  semanticTimeoutMs: 5_000,
  runDeadlineMs: 30_000,
  profiles: {
    public: [
      {
        id: 'home-content',
        path: '/',
        assertions: [{ selector: '.home-stage', minCount: 1 }],
      },
    ],
    authenticated: [
      {
        id: 'arena-tier-list-data',
        path: '/tierlist',
        assertions: [{ selector: '.hs-tier-card', minCount: 2 }],
      },
    ],
  },
};

test('configuration accepts stable public and authenticated semantic checks', () => {
  assert.equal(validateObserverConfig(structuredClone(validConfig)), validConfig.schemaVersion);
});

test('configuration rejects duplicate IDs, query-bearing paths and empty assertions', () => {
  const duplicate = structuredClone(validConfig);
  duplicate.profiles.authenticated[0].id = 'home-content';
  assert.throws(() => validateObserverConfig(duplicate), /duplicate check id/);

  const queryPath = structuredClone(validConfig);
  queryPath.profiles.public[0].path = '/?private=value';
  assert.throws(() => validateObserverConfig(queryPath), /path must not contain query/);

  const empty = structuredClone(validConfig);
  empty.profiles.public[0].assertions = [];
  assert.throws(() => validateObserverConfig(empty), /at least one assertion/);
});

test('public route inventory returns every normalized route exactly once', () => {
  const paths = publicRoutePaths({
    schemaVersion: 1,
    pages: {
      '/faq': { title: 'FAQ' },
      '/': { title: 'Home' },
      '/articles': { title: 'Articles' },
    },
  });
  assert.deepEqual(paths, ['/', '/articles', '/faq']);
  assert.throws(
    () => publicRoutePaths({ schemaVersion: 1, pages: { '/bad?token=x': {} } }),
    /route path must not contain query/,
  );
});

test('diagnostic sanitizer removes secrets, emails, queries and control characters', () => {
  const message = sanitizeDiagnostic(
    'request https://hearthpulse.net/login?token=secret\n'
      + 'Authorization: Bearer abc.def email=reader@example.com cookie=session-value',
  );
  assert.equal(message.includes('secret'), false);
  assert.equal(message.includes('abc.def'), false);
  assert.equal(message.includes('reader@example.com'), false);
  assert.equal(message.includes('session-value'), false);
  assert.equal(message.includes('?'), false);
  assert.equal(/[\r\n\t]/.test(message), false);
});

test('public run emits deterministic bounded events and checks every route', async () => {
  const routeCalls = [];
  const browserCalls = [];
  const events = [];
  const report = await runObserverChecks({
    config: structuredClone(validConfig),
    publicRoutes: ['/faq', '/'],
    profile: 'public',
    baseUrl: 'https://hearthpulse.net',
    routeProbe: async path => { routeCalls.push(path); },
    browserProbe: async check => { browserCalls.push(check.id); },
    onEvent: event => events.push(event),
    runId: 'observer-test-run',
    now: (() => {
      let tick = Date.parse('2026-09-02T00:00:00.000Z');
      return () => new Date(tick += 10);
    })(),
  });

  assert.deepEqual(routeCalls, ['/', '/faq']);
  assert.deepEqual(browserCalls, ['home-content']);
  assert.equal(report.status, 'ok');
  assert.deepEqual(report.counts, { total: 3, passed: 3, failed: 0 });
  assert.deepEqual(events.map(event => event.event), [
    'run_started',
    'check_finished',
    'check_finished',
    'check_finished',
    'run_finished',
  ]);
  assert.deepEqual(events.map(event => event.sequence), [1, 2, 3, 4, 5]);
  assert.equal(JSON.stringify(events).includes('https://'), false);
});

test('failed checks are aggregated with stable codes and sanitized messages', async () => {
  const events = [];
  await assert.rejects(
    runObserverChecks({
      config: structuredClone(validConfig),
      publicRoutes: ['/'],
      profile: 'public',
      baseUrl: 'https://hearthpulse.net',
      routeProbe: async () => {
        const error = new Error('HTTP 503 token=top-secret reader@example.com');
        error.code = 'HTTP_STATUS';
        error.stage = 'document';
        throw error;
      },
      browserProbe: async () => {},
      onEvent: event => events.push(event),
      runId: 'observer-failure-run',
    }),
    error => {
      assert.ok(error instanceof ObserverRunFailure);
      assert.equal(error.report.status, 'error');
      assert.equal(error.report.failures[0].code, 'HTTP_STATUS');
      assert.equal(error.report.failures[0].stage, 'document');
      assert.equal(error.report.failures[0].message.includes('top-secret'), false);
      assert.equal(error.report.failures[0].message.includes('reader@example.com'), false);
      return true;
    },
  );
  assert.equal(events.at(-1).event, 'run_finished');
  assert.equal(events.at(-1).status, 'error');
});

test('authenticated profile fails closed without a synthetic session secret', async () => {
  await assert.rejects(
    runObserverChecks({
      config: structuredClone(validConfig),
      publicRoutes: ['/'],
      profile: 'authenticated',
      baseUrl: 'https://hearthpulse.net',
      routeProbe: async () => {},
      browserProbe: async () => {},
      runId: 'observer-auth-run',
    }),
    error => error instanceof ObserverConfigurationError
      && /PRODUCTION_OBSERVER_AUTH_COOKIE/.test(error.message),
  );
});

test('HTTP probe accepts bounded HTML and classifies status failures', async () => {
  const probe = createHttpRouteProbe({
    baseUrl: 'https://hearthpulse.net',
    timeoutMs: 1_000,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Accept.includes('text/html'), true);
      return new Response('<!doctype html><html><body>ok</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    },
  });
  await probe('/');

  const failingProbe = createHttpRouteProbe({
    baseUrl: 'https://hearthpulse.net',
    timeoutMs: 1_000,
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  });
  await assert.rejects(failingProbe('/'), error => error.code === 'HTTP_STATUS');
});

test('HTTP probe retries one transient network failure', async () => {
  let attempts = 0;
  const probe = createHttpRouteProbe({
    baseUrl: 'https://hearthpulse.net',
    timeoutMs: 1_000,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary connection reset');
      return new Response('<html><body>recovered</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    },
  });
  await probe('/');
  assert.equal(attempts, 2);
});

test('runner writes JSONL and summary artifacts without diagnostic secrets', async () => {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-observer-test-'));
  const eventLines = [];
  try {
    const { report, outputDirectory } = await runProductionObserver({
      config: structuredClone(validConfig),
      routeDocument: { schemaVersion: 1, pages: { '/': {} } },
      profile: 'public',
      baseUrl: 'https://hearthpulse.net',
      runId: 'artifact-test',
      outputRoot,
      routeProbe: async () => {},
      createBrowserProbe: async () => ({ probe: async () => {}, close: async () => {} }),
      console: { log: line => eventLines.push(line) },
    });
    const events = readFileSync(path.join(outputDirectory, 'events.jsonl'), 'utf8');
    const summary = JSON.parse(readFileSync(path.join(outputDirectory, 'summary.json'), 'utf8'));
    assert.equal(report.status, 'ok');
    assert.equal(summary.counts.total, 2);
    assert.equal(events.trim().split('\n').length, eventLines.length);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('runner leaves an artifact when authenticated configuration is missing', async () => {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-observer-auth-test-'));
  try {
    await assert.rejects(
      runProductionObserver({
        config: structuredClone(validConfig),
        routeDocument: { schemaVersion: 1, pages: { '/': {} } },
        profile: 'authenticated',
        baseUrl: 'https://hearthpulse.net',
        runId: 'auth-artifact-test',
        outputRoot,
        console: { log: () => {} },
      }),
      error => {
        const summary = readFileSync(path.join(error.outputDirectory, 'summary.json'), 'utf8');
        assert.equal(summary.includes('CONFIGURATION_ERROR'), true);
        assert.equal(summary.includes('PRODUCTION_OBSERVER_AUTH_COOKIE'), true);
        return error instanceof ObserverConfigurationError;
      },
    );
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('runner rejects a base URL with a path before launching a browser', async () => {
  let browserStarted = false;
  await assert.rejects(
    runProductionObserver({
      config: structuredClone(validConfig),
      routeDocument: { schemaVersion: 1, pages: { '/': {} } },
      baseUrl: 'https://hearthpulse.net/private',
      createBrowserProbe: async () => {
        browserStarted = true;
        return { probe: async () => {}, close: async () => {} };
      },
    }),
    error => error instanceof ObserverConfigurationError && /base URL/.test(error.message),
  );
  assert.equal(browserStarted, false);
});
