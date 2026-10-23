import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// Public profile pages were removed on 2026-10-23. Their old addresses must be
// real 404s that never ask Express for a profile again.
test('removed public profile routes answer 404 without a profile lookup', async () => {
  const requests = [];
  const backend = http.createServer((request, response) => {
    requests.push(request.url);
    response.statusCode = 404;
    response.setHeader('Content-Type', 'application/json');
    response.end('{"error":"not found"}');
  });
  const backendOrigin = await listenLocal(backend);
  const reservation = http.createServer();
  const origin = process.env.NEXT_PROFILE_ORIGIN || await listenLocal(reservation);
  if (!process.env.NEXT_PROFILE_ORIGIN) await closeLocal(reservation);
  const child = process.env.NEXT_PROFILE_ORIGIN ? null : spawn(process.execPath,
    ['node_modules/next/dist/bin/next', 'start', 'apps/public-web', '--hostname', '127.0.0.1',
      '--port', new URL(origin).port], {
      env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '',
        LEGACY_WEB_ORIGIN: backendOrigin },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  let output = '';
  child?.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child?.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (child && child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${origin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.equal(ready, true, `Next did not start: ${output}`);
    for (const path of ['/id/7/', '/profiles/p_AbCdEfGhIjKlMnOpQrStUv/']) {
      const response = await fetch(`${origin}${path}`);
      const html = await response.text();
      assert.equal(response.status, 404, path);
      assert.match(html, /name="robots" content="noindex/, `${path} stays out of search`);
      assert.doesNotMatch(html, /Публичный профиль|Скопировать ссылку/, path);
    }
    assert.equal(requests.some(url => url?.startsWith('/api/profiles/')), false, 'no profile lookup reaches Express');
  } finally {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => undefined); }
    await closeLocal(backend);
  }
});
