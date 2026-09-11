import assert from 'node:assert/strict';
import express from 'express';
import { createBrowserSessionCookieHandlers, legacyArenaCookieDomain } from '../server/modules/browserSessionCookies/public.js';

const handlers = createBrowserSessionCookieHandlers({
  cookieName: 'manacost_auth_token',
  sessionTtlMs: 8 * 60 * 60 * 1000,
  appUrl: 'https://hearthpulse.net',
});
const app = express();
app.get('/set', (request, response) => {
  handlers.setAuthCookie(request, response, 'token with spaces');
  response.status(204).end();
});
app.get('/clear', (request, response) => {
  handlers.clearAuthCookie(request, response);
  response.status(204).end();
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}`;

try {
  const set = await fetch(`${base}/set`, { headers: { Host: 'hearthpulse.net', 'X-Forwarded-Proto': 'https' } });
  assert.equal(set.status, 204);
  assert.equal(set.headers.get('set-cookie'), 'manacost_auth_token=token%20with%20spaces; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=28800');

  const clear = await fetch(`${base}/clear`, { headers: { Host: 'hearthpulse.net', 'X-Forwarded-Proto': 'https' } });
  assert.equal(clear.status, 204);
  assert.equal(clear.headers.get('set-cookie'), 'manacost_auth_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');

  assert.equal(
    legacyArenaCookieDomain({ headers: { host: 'arena.hs-manacost.ru' } } as unknown as import('express').Request, 'https://arena.hs-manacost.ru'),
    'Domain=.arena.hs-manacost.ru',
  );
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('Browser session cookie contract tests passed');
