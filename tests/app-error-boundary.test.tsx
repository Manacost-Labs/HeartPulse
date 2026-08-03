import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AppErrorRecoveryScreen from '../src/components/AppErrorRecoveryScreen';
import {
  classifyAppError,
  createIncidentId,
  releaseIdFromModuleUrl,
} from '../src/components/appErrorRecovery';
import { registerAppIncident } from '../src/telemetry/clientIncident';

assert.equal(releaseIdFromModuleUrl('https://example.test/assets/index.js?v=abcdef1'), 'abcdef1');
assert.equal(
  releaseIdFromModuleUrl('https://example.test/assets/index.js?v=ABCDEF1234567890'),
  'abcdef1234567890',
);
assert.equal(releaseIdFromModuleUrl('https://example.test/assets/index.js?v=not-a-sha'), 'development');
assert.equal(releaseIdFromModuleUrl('not a URL'), 'development');

for (const error of [
  new Error('ChunkLoadError'),
  new Error('Loading chunk 42 failed'),
  new TypeError('Failed to fetch dynamically imported module: /assets/route.js'),
  new Error('Importing a module script failed'),
  'error loading dynamically imported module',
  new Error('Unable to preload CSS for /assets/GlobalUtilityHeader-test.css'),
]) {
  assert.equal(classifyAppError(error), 'chunk');
}
assert.equal(classifyAppError(new TypeError('Cannot read properties of undefined')), 'render');
assert.equal(classifyAppError(new Error('Image load failed')), 'render');

const firstIncident = createIncidentId();
const secondIncident = createIncidentId();
assert.match(firstIncident, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
assert.notEqual(firstIncident, secondIncident);

const originalFetch = globalThis.fetch;
let diagnosticRequest: { input: string; init?: RequestInit } | null = null;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  diagnosticRequest = { input: String(input), init };
  return new Response(null, { status: 200 });
}) as typeof fetch;
registerAppIncident(firstIncident, {
  kind: 'render',
  releaseId: 'abcdef1234567890',
  error: new TypeError('Cannot render dataset'),
  componentStack: 'at StandardOperationsLegacy',
  scope: 'application-root',
});
globalThis.fetch = originalFetch;
assert.equal(diagnosticRequest?.input, '/api/telemetry/client-errors');
assert.equal(new Headers(diagnosticRequest?.init?.headers).get('content-type'), 'application/json');
assert.equal(diagnosticRequest?.init?.keepalive, true);
assert.equal(diagnosticRequest?.init?.method, 'POST');
assert.equal(diagnosticRequest?.init?.credentials, 'omit');
const diagnosticBody = JSON.parse(String(diagnosticRequest?.init?.body));
assert.match(diagnosticBody.stack, /TypeError: Cannot render dataset/);
assert.deepEqual(diagnosticBody, {
  incidentId: firstIncident,
  kind: 'render',
  releaseId: 'abcdef1234567890',
  route: '/',
  scope: 'application-root',
  errorName: 'TypeError',
  message: 'Cannot render dataset',
  stack: diagnosticBody.stack,
  componentStack: 'at StandardOperationsLegacy',
});

const renderMarkup = renderToStaticMarkup(
  <AppErrorRecoveryScreen
    kind="render"
    incidentId="11111111-2222-4333-8444-555555555555"
    releaseId="abcdef1234567890"
    onRetry={() => {}}
  />,
);
assert.match(renderMarkup, /role="alert"/);
assert.match(renderMarkup, /Произошла ошибка интерфейса/);
assert.match(renderMarkup, /Повторить/);
assert.match(renderMarkup, /11111111-2222-4333-8444-555555555555/);
assert.match(renderMarkup, /abcdef1234567890/);
assert.doesNotMatch(renderMarkup, /stack|secret|undefined/i);

const chunkMarkup = renderToStaticMarkup(
  <AppErrorRecoveryScreen
    kind="chunk"
    incidentId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    releaseId="development"
    onRetry={() => {}}
  />,
);
assert.match(chunkMarkup, /Нужно обновить страницу/);
assert.match(chunkMarkup, /Обновить страницу/);

const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
assert.match(mainSource, /typeof __APP_RELEASE_SHA__ === 'string'/);
assert.match(mainSource, /<AppErrorBoundary releaseId=\{releaseId\}>/);

const viteConfigSource = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
assert.match(viteConfigSource, /__APP_RELEASE_SHA__/);
assert.match(viteConfigSource, /GITHUB_SHA/);

console.log('App error boundary tests passed');
