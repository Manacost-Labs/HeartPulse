import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startQaBackend } from '../scripts/qa/backend.mjs';
import { qaSessionCookie, qaSessionFromCookie } from '../scripts/qa/mockApi.mjs';

test('QA session cookies name exactly one fixture account', () => {
  assert.deepEqual(qaSessionFromCookie(qaSessionCookie({ admin: true })), { authenticated: true, admin: true });
  assert.deepEqual(qaSessionFromCookie(`theme=dark; ${qaSessionCookie()}`), { authenticated: true, admin: false });
  assert.deepEqual(qaSessionFromCookie('manacost_auth_token=real-session'), { authenticated: false, admin: false });
  assert.deepEqual(qaSessionFromCookie(undefined), { authenticated: false, admin: false });
});

test('the QA backend answers Next.js server rendering the way Express would', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'qa-backend-'));
  writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\n');
  const next = http.createServer((request, response) => {
    response.writeHead(request.url === '/404.html' ? 404 : 500, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<h1>Страница не найдена</h1>');
  });
  next.listen(0, '127.0.0.1');
  await once(next, 'listening');
  const backend = await startQaBackend({ distDir: dist });
  backend.setNotFoundOrigin(`http://127.0.0.1:${next.address().port}`);
  try {
    const currentUser = cookie => fetch(`${backend.origin}/api/auth/me`, { headers: cookie ? { cookie } : {} })
      .then(response => response.json());
    const admin = await currentUser(qaSessionCookie({ admin: true }));
    assert.equal(admin.user.id, 'qa-admin');
    assert.equal(admin.adminAllowed, true, 'the Next.js admin guard reads the top-level access flag');
    const subscriber = await currentUser(qaSessionCookie());
    assert.equal(subscriber.user.id, 'qa-subscriber');
    assert.equal(subscriber.adminAllowed, false);
    assert.deepEqual(await currentUser(), { user: null, adminAllowed: false, contestAdminAllowed: false });

    const hero = await fetch(`${backend.origin}/api/bg/heroes/public/9001`);
    assert.equal(hero.status, 200);
    assert.equal((await hero.json()).hero.name, 'Контрольный герой');

    const missing = await fetch(`${backend.origin}/api/qa/no-such-fixture`);
    assert.equal(missing.status, 404, 'a fixture gap is an ordinary miss, not a server error');
    assert.deepEqual(await missing.json(), { error: 'Not found' });

    assert.equal(await fetch(`${backend.origin}/robots.txt`).then(response => response.text()), 'User-agent: *\n');
    const unknownPage = await fetch(`${backend.origin}/qa/unknown-page`);
    assert.equal(unknownPage.status, 404);
    assert.match(await unknownPage.text(), /Страница не найдена/, 'unknown pages get the Next.js not-found document');
  } finally {
    await backend.close();
    next.closeAllConnections();
    await new Promise(resolve => next.close(resolve));
    rmSync(dist, { recursive: true, force: true });
  }
});
