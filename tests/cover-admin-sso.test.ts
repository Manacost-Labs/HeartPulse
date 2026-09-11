import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createCoverAdminSsoRouter } from '../server/modules/coverAdminSso/public.js';

type User = { id: string; role: 'admin' | 'user'; blocked?: boolean };
const users = new Map<string, User>([
  ['admin-1', { id: 'admin-1', role: 'admin' }],
  ['member-1', { id: 'member-1', role: 'user' }],
]);
let activeUser: User | null = null;
let clock = 1_700_000_000_000;
const redeemedTicketHashes = new Set<string>();
const signingSecret = 'test-signing-secret-'.repeat(2);
const proxyKey = 'test-proxy-key-'.repeat(3);

const app = express();
app.use('/api', createCoverAdminSsoRouter({
  authenticate: () => activeUser,
  resolveUser: userId => users.get(userId) ?? null,
  isAdmin: user => user.role === 'admin' && !user.blocked,
  redeemHandoff: ticketHash => {
    if (redeemedTicketHashes.has(ticketHash)) return false;
    redeemedTicketHashes.add(ticketHash);
    return true;
  },
  signingSecret,
  proxyKey,
  coverOrigin: 'https://cover.hs-manacost.ru/',
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  now: () => clock,
  random: () => Buffer.alloc(18, 7),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/auth/cover`;
const internalHeaders = { 'X-Cover-Sso-Key': proxyKey };

try {
  activeUser = null;
  const login = await fetch(`${base}/start`, { redirect: 'manual' });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('location'), '/?login&returnTo=%2Fapi%2Fauth%2Fcover%2Fstart');
  assert.equal(login.headers.get('cache-control'), 'private, no-store');

  activeUser = users.get('member-1')!;
  const member = await fetch(`${base}/start`, { redirect: 'manual' });
  assert.equal(member.status, 403);

  activeUser = users.get('admin-1')!;
  const start = await fetch(`${base}/start`, { redirect: 'manual' });
  assert.equal(start.status, 303);
  const callback = new URL(String(start.headers.get('location')));
  assert.equal(callback.origin, 'https://cover.hs-manacost.ru');
  assert.equal(callback.pathname, '/_hearthpulse/callback');
  const ticket = callback.searchParams.get('ticket');
  assert.ok(ticket);

  const forgedTicket = `${ticket.slice(0, -1)}${ticket.endsWith('A') ? 'B' : 'A'}`;
  const forgedCallback = await fetch(`${base}/callback?ticket=${encodeURIComponent(forgedTicket)}`, {
    headers: internalHeaders,
    redirect: 'manual',
  });
  assert.equal(forgedCallback.status, 400, 'a forged hand-off must not be redeemed');

  const blockedCallback = await fetch(`${base}/callback?ticket=${encodeURIComponent(ticket)}`, { redirect: 'manual' });
  assert.equal(blockedCallback.status, 404, 'callback is only callable through the local Cover proxy');

  const callbackResponse = await fetch(`${base}/callback?ticket=${encodeURIComponent(ticket)}`, {
    headers: internalHeaders,
    redirect: 'manual',
  });
  assert.equal(callbackResponse.status, 303);
  assert.equal(callbackResponse.headers.get('location'), '/');
  assert.equal(callbackResponse.headers.get('referrer-policy'), 'no-referrer');
  const coverCookie = String(callbackResponse.headers.get('set-cookie'));
  assert.match(coverCookie, /cover_admin_session=/);
  assert.match(coverCookie, /HttpOnly/);
  assert.match(coverCookie, /Secure/);
  assert.match(coverCookie, /SameSite=Lax/);
  assert.doesNotMatch(coverCookie, /Domain=/, 'Cover session cookie must remain host-only');

  const replayedCallback = await fetch(`${base}/callback?ticket=${encodeURIComponent(ticket)}`, {
    headers: internalHeaders,
    redirect: 'manual',
  });
  assert.equal(replayedCallback.status, 400, 'the hand-off ticket is single use');

  const authorized = await fetch(`${base}/authorize`, {
    headers: { ...internalHeaders, Cookie: coverCookie.split(';')[0] },
  });
  assert.equal(authorized.status, 204);

  const sessionCookie = coverCookie.split(';')[0];
  const tamperedSession = `${sessionCookie.slice(0, -1)}${sessionCookie.endsWith('A') ? 'B' : 'A'}`;
  const forgedSession = await fetch(`${base}/authorize`, {
    headers: { ...internalHeaders, Cookie: tamperedSession },
  });
  assert.equal(forgedSession.status, 401, 'a forged Cover session must be rejected');

  users.get('admin-1')!.role = 'user';
  const revoked = await fetch(`${base}/authorize`, {
    headers: { ...internalHeaders, Cookie: coverCookie.split(';')[0] },
  });
  assert.equal(revoked.status, 403, 'role removal must take effect on the next Cover request');
  users.get('admin-1')!.role = 'admin';

  const expiredTicket = new URL(String(start.headers.get('location'))).searchParams.get('ticket')!;
  clock += 2 * 60_000 + 1;
  const expired = await fetch(`${base}/callback?ticket=${encodeURIComponent(expiredTicket)}`, {
    headers: internalHeaders,
    redirect: 'manual',
  });
  assert.equal(expired.status, 400);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

const compositionSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
assert.match(
  compositionSource,
  /resolveUser:\s*findAuthUserById/,
  'per-request Cover authorization must use the targeted user lookup, not the full auth store',
);
assert.match(
  compositionSource,
  /req\.path === '\/auth\/cover\/authorize'/,
  'the high-frequency internal authorization request must not consume the public API limiter budget',
);

console.log('Cover administrator SSO contract tests passed');
