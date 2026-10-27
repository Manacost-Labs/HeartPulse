import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { startCredentialBackend } from './helpers/credentialBackend.mjs';

// The production server (an https APP_URL) on temporary state: which session
// and Telegram cookies a browser receives, and how the server treats them.
// Telegram itself is never called: these routes stop before any upstream read.
const APP_URL = 'https://hearthpulse.test';
const sha = value => createHash('sha256').update(value).digest('hex');
let backend;
let sessionToken = '';
let signInCookies = [];

function emailedCode(body) {
  const plain = body.match(/\b(\d{6})\b/);
  if (plain) return plain[1];
  for (const part of body.split(/\r?\n\r?\n/)) {
    const decoded = Buffer.from(part.replace(/\s+/g, ''), 'base64').toString('utf8').match(/\b(\d{6})\b/);
    if (decoded) return decoded[1];
  }
  return assert.fail('the e-mail carries no six-digit code');
}

const get = (path, headers = {}) => fetch(`${backend.origin}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(8000) });
const post = (path, headers = {}) => fetch(`${backend.origin}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}', redirect: 'manual', signal: AbortSignal.timeout(8000),
});

before(async () => {
  backend = await startCredentialBackend({ env: {
    APP_URL,
    TELEGRAM_OIDC_CLIENT_ID: '123456',
    TELEGRAM_OIDC_CLIENT_SECRET: 'integration-oidc-client-secret-0123456789',
    TELEGRAM_AUTH_BOT_TOKEN: '123456:integration-bot-token',
    TELEGRAM_AUTH_BOT_USERNAME: '@manacost_auth_bot',
  } });
  const email = 'cookies@example.test';
  const registration = backend.request('/api/auth/register',
    { email, password: 'test-password-123', name: 'Cookie Reader', country: 'Россия', newsletterOptIn: false }, { Origin: APP_URL });
  const delivery = await backend.smtp.delivery(email);
  delivery.accept();
  assert.equal((await registration).status, 200);
  const verified = await backend.request('/api/auth/verify', { email, code: emailedCode(delivery.body) }, { Origin: APP_URL });
  assert.equal(verified.status, 200, await verified.text());
  signInCookies = verified.headers.getSetCookie();
  sessionToken = signInCookies.find(cookie => cookie.startsWith('__Host-manacost_auth_token='))?.split(';')[0].split('=')[1] ?? '';
});

after(async () => { await backend?.close(); });

test('sign-in on the production host sets a host-bound session cookie and clears the old one', () => {
  assert.match(sessionToken, /^[a-f0-9]{64}$/);
  assert.deepEqual(signInCookies.filter(cookie => /auth_token=/.test(cookie)), [
    'manacost_auth_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    `__Host-manacost_auth_token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=34560000`,
  ]);
});

test('the host-bound cookie signs the reader in', async () => {
  const me = await (await get('/api/auth/me', { Cookie: `__Host-manacost_auth_token=${sessionToken}` })).json();
  assert.equal(me.user?.email, 'cookies@example.test');
});

test('a cross-site request carrying the session cookie cannot sign the reader out', async () => {
  const cookie = `__Host-manacost_auth_token=${sessionToken}`;
  const forged = await post('/api/auth/logout', { Cookie: cookie, Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(forged.status, 403);
  const me = await (await get('/api/auth/me', { Cookie: cookie })).json();
  assert.equal(me.user?.email, 'cookies@example.test', 'the session survives the forged request');
});

test('Telegram sign-in keeps its state and intent in host-bound cookies', async () => {
  const started = await get('/api/auth/telegram/start');
  assert.equal(started.status, 302);
  assert.match(started.headers.get('location') ?? '', /^https:\/\/oauth\.telegram\.org\/auth\?client_id=123456&/);
  assert.ok(started.headers.getSetCookie().some(cookie => /^__Host-manacost_tg_oidc=[^;]+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/.test(cookie)));

  const configured = await get('/api/auth/telegram/config');
  assert.ok(configured.headers.getSetCookie().some(cookie => /^__Host-manacost_tg_intent=[^;]+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/.test(cookie)));
});

test('with OIDC and the bot both configured the widget still gets a fresh legacy intent', async () => {
  const before = Date.now();
  const config = await (await get('/api/auth/telegram/config')).json();
  assert.equal(config.mode, 'oidc');
  assert.equal(config.authUrl, `${APP_URL}/api/auth/telegram/start`);
  assert.equal(config.botUsername, 'manacost_auth_bot');
  assert.match(config.legacyIntent, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(config.callbackUrl, `${APP_URL}/api/auth/telegram/callback?intent=${config.legacyIntent}`);
  assert.ok(config.legacyIntentExpiresAt >= before + 9 * 60_000 && config.legacyIntentExpiresAt <= Date.now() + 10 * 60_000,
    'the widget learns when its intent expires so it can refresh it');
});

test('a forged or broken Telegram state cookie ends the callback with a sign-in error', async () => {
  for (const cookie of ['__Host-manacost_tg_oidc=garbage', '__Host-manacost_tg_oidc=a.b.c', '__Host-manacost_tg_oidc=%E0%A4%A', '']) {
    const callback = await get('/api/auth/telegram/callback?code=upstream-code&state=forged', { Cookie: cookie });
    assert.equal(callback.status, 302, `cookie ${JSON.stringify(cookie)}`);
    assert.equal(callback.headers.get('location'), '/?login&telegram=error');
  }
});

test('a bot link code is long and bound to the session that asked for it', async () => {
  const issued = await post('/api/auth/telegram/link-code',
    { Cookie: `__Host-manacost_auth_token=${sessionToken}`, Origin: APP_URL, 'X-CSRF-Request': '1' });
  assert.equal(issued.status, 200);
  const body = await issued.json();
  assert.match(body.code, /^TG-[A-Za-z0-9_-]{24}$/, '18 random bytes: more than 128 bits');
  assert.equal(body.botUrl, `https://t.me/manacost_auth_bot?start=${body.code}`);
  const stored = backend.database.prepare('SELECT session_token_hash FROM telegram_link_tokens').all();
  assert.deepEqual(stored.map(row => row.session_token_hash), [sha(sessionToken)]);
  assert.equal((await post('/api/auth/telegram/link-code', { Origin: APP_URL, 'X-CSRF-Request': '1' })).status, 401);
});

test('explicit Telegram linking binds its state to the initiating session', async () => {
  const started = await post('/api/auth/telegram/link-start',
    { Cookie: `__Host-manacost_auth_token=${sessionToken}`, Origin: APP_URL, 'X-CSRF-Request': '1' });
  assert.equal(started.status, 200);
  const stateCookie = started.headers.getSetCookie().find(cookie => cookie.startsWith('__Host-manacost_tg_oidc='));
  const payload = JSON.parse(Buffer.from(stateCookie.split(';')[0].split('=')[1].split('.')[0], 'base64url').toString('utf8'));
  assert.equal(payload.states.at(-1).purpose, 'link');
  assert.equal(payload.states.at(-1).linkSessionHash, sha(sessionToken));
});

test('the account page learns which sign-in methods the account already uses', async () => {
  const cookie = { Cookie: `__Host-manacost_auth_token=${sessionToken}` };
  const before = await (await get('/api/account/linked-providers', cookie)).json();
  const userId = backend.database.prepare("SELECT id FROM users WHERE email = 'cookies@example.test'").get().id;
  backend.database.prepare(`INSERT INTO identities (user_id, provider, provider_user_id, created_at, updated_at)
    VALUES (?, 'telegram_oidc', 'tg-42', '2026-10-27', '2026-10-27')`).run(userId);
  const after = await (await get('/api/account/linked-providers', cookie)).json();
  assert.deepEqual(before.providers.filter(provider => provider !== 'email'), []);
  assert.deepEqual(after.providers.filter(provider => provider !== 'email'), ['telegram']);
  assert.equal((await get('/api/account/linked-providers')).status, 401);
});
