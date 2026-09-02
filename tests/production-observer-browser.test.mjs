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

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
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

test('real browser probe never includes arbitrary console data in a failure', { skip: !chromePath }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><body><main class="ready"></main><script>
      console.error(JSON.stringify({user:{name:'Alice Smith',id:'usr_123'},subscription:{plan:'premium'}}));
    </script></body></html>`);
  });
  const origin = await listen(server);
  const browser = await createBrowserProbe({
    baseUrl: origin,
    navigationTimeoutMs: 5_000,
    semanticTimeoutMs: 2_000,
    executablePath: chromePath,
  });
  try {
    await assert.rejects(
      browser.probe({
        id: 'controlled-console-error',
        path: '/',
        assertions: [{ selector: '.ready', minCount: 1 }],
      }),
      error => error.code === 'CONSOLE_ERROR'
        && error.stage === 'runtime'
        && error.message === 'browser console error',
    );
  } finally {
    await browser.close();
    await closeServer(server);
  }
});

test('real browser probe never includes arbitrary page exception data in a failure', { skip: !chromePath }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><body><main class="ready"></main><script>
      setTimeout(() => { throw new Error('Alice Smith usr_123 premium'); });
    </script></body></html>`);
  });
  const origin = await listen(server);
  const browser = await createBrowserProbe({
    baseUrl: origin,
    navigationTimeoutMs: 5_000,
    semanticTimeoutMs: 2_000,
    executablePath: chromePath,
  });
  try {
    await assert.rejects(
      browser.probe({
        id: 'controlled-page-error',
        path: '/',
        assertions: [{ selector: '.ready', minCount: 1 }],
      }),
      error => error.code === 'PAGE_ERROR'
        && error.stage === 'runtime'
        && error.message === 'unhandled page error',
    );
  } finally {
    await browser.close();
    await closeServer(server);
  }
});

test('real browser probe bounds authentication response parsing', { skip: !chromePath }, async () => {
  const openResponses = new Set();
  const server = createServer((request, response) => {
    if (request.url === '/api/auth/me') {
      openResponses.add(response);
      response.on('close', () => openResponses.delete(response));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"user":');
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><body><main class="ready"></main></body></html>');
  });
  const origin = await listen(server);
  const browser = await createBrowserProbe({
    baseUrl: origin,
    authCookie: 'synthetic-session',
    navigationTimeoutMs: 5_000,
    semanticTimeoutMs: 150,
    executablePath: chromePath,
  });
  const startedAt = Date.now();
  try {
    await assert.rejects(
      browser.probe({
        id: 'controlled-auth-timeout',
        path: '/',
        assertions: [{ selector: '.ready', minCount: 1 }],
      }),
      error => error.code === 'AUTH_SESSION_TIMEOUT' && error.stage === 'authentication',
    );
    assert.ok(Date.now() - startedAt < 2_000);
  } finally {
    for (const response of openResponses) response.destroy();
    await browser.close();
    await closeServer(server);
  }
});

test('real browser probe rejects a final document on another origin', { skip: !chromePath }, async () => {
  const destination = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><body><main class="ready"></main></body></html>');
  });
  const destinationOrigin = await listen(destination);
  const source = createServer((_request, response) => {
    response.writeHead(302, { Location: `${destinationOrigin}/captured` });
    response.end();
  });
  const sourceOrigin = await listen(source);
  const browser = await createBrowserProbe({
    baseUrl: sourceOrigin,
    navigationTimeoutMs: 5_000,
    semanticTimeoutMs: 2_000,
    executablePath: chromePath,
  });
  try {
    await assert.rejects(
      browser.probe({
        id: 'controlled-cross-origin',
        path: '/',
        assertions: [{ selector: '.ready', minCount: 1 }],
      }),
      error => error.code === 'CROSS_ORIGIN_REDIRECT' && error.stage === 'navigation',
    );
  } finally {
    await browser.close();
    await closeServer(source);
    await closeServer(destination);
  }
});
