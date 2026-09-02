import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';

import { createBrowserProbe } from '../scripts/production-observer/browser-probe.mjs';

const chromePath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));

async function controlledServer() {
  const server = createServer((request, response) => {
    if (request.url === '/api/auth/me') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        user: request.headers.cookie === 'manacost_auth_token=synthetic-session'
          ? { id: 'observer' }
          : null,
      }));
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><body><main class="ready"><span>A</span><span>B</span></main></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

test('real browser probe verifies semantic counts on a controlled server', { skip: !chromePath }, async () => {
  const local = await controlledServer();
  const browser = await createBrowserProbe({
    baseUrl: local.origin,
    navigationTimeoutMs: 5_000,
    semanticTimeoutMs: 2_000,
    executablePath: chromePath,
  });
  try {
    await browser.probe({
      id: 'controlled-content',
      path: '/',
      assertions: [{ selector: '.ready span', minCount: 2 }],
    });
  } finally {
    await browser.close();
    await local.close();
  }
});

test('real browser probe verifies the synthetic session without exposing it', { skip: !chromePath }, async () => {
  const local = await controlledServer();
  const browser = await createBrowserProbe({
    baseUrl: local.origin,
    authCookie: 'synthetic-session',
    navigationTimeoutMs: 5_000,
    semanticTimeoutMs: 2_000,
    executablePath: chromePath,
  });
  try {
    await browser.probe({
      id: 'controlled-auth',
      path: '/',
      assertions: [{ selector: '.ready', minCount: 1 }],
    });
  } finally {
    await browser.close();
    await local.close();
  }
});

test('real browser probe returns a stable semantic failure', { skip: !chromePath }, async () => {
  const local = await controlledServer();
  const browser = await createBrowserProbe({
    baseUrl: local.origin,
    navigationTimeoutMs: 5_000,
    semanticTimeoutMs: 150,
    executablePath: chromePath,
  });
  try {
    await assert.rejects(
      browser.probe({
        id: 'controlled-missing',
        path: '/',
        assertions: [{ selector: '.missing', minCount: 1 }],
      }),
      error => error.code === 'BROWSER_CHECK_FAILED' && error.stage === 'browser',
    );
  } finally {
    await browser.close();
    await local.close();
  }
});
