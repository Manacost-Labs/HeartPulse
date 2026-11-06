import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import express from 'express';
import type { ApplicationAuthManager, ApplicationAuthScope, ApplicationToken } from '../server/modules/applicationAuth/public.js';
import {
  createTwitchAccountRouter,
  createTwitchApi,
  createTwitchApiRouter,
  createTwitchExtensionCors,
  createTwitchLinkPageRouter,
  createTwitchLinkRepository,
  createTwitchLiveState,
  readTwitchEnvelope,
  readTwitchExtensionConfig,
  signTwitchJwt,
  verifyTwitchJwt,
  type TwitchExtensionConfig,
} from '../server/modules/twitchExtension/public.js';

const SECRET_B64 = randomBytes(32).toString('base64');
const ENV = {
  TWITCH_EXTENSION_CLIENT_ID: 'abc123clientid',
  TWITCH_EXTENSION_SECRET: SECRET_B64,
  TWITCH_EXTENSION_OWNER_ID: '999',
  TWITCH_OAUTH_CLIENT_SECRET: 'oauth-client-secret',
  TWITCH_OAUTH_REDIRECT_URI: 'https://hearthpulse.net/api/account/twitch/callback',
};
const EXT_ORIGIN = 'https://abc123clientid.ext-twitch.tv';

// Configuration: every variable is required and the secret is decoded from base64.
assert.equal(readTwitchExtensionConfig({}), null);
for (const key of Object.keys(ENV)) {
  assert.equal(readTwitchExtensionConfig({ ...ENV, [key]: '' }), null, `${key} is required`);
}
assert.equal(readTwitchExtensionConfig({ ...ENV, TWITCH_EXTENSION_SECRET: 'not base64!' }), null);
const config = readTwitchExtensionConfig(ENV) as TwitchExtensionConfig;
assert.ok(config);
assert.deepEqual(config.extensionSecret, Buffer.from(SECRET_B64, 'base64'));

// JWT: HS256 with the decoded secret only.
let clock = 1_762_500_000_000;
const secret = config.extensionSecret;
const viewerJwt = (channelId: string, expSeconds = Math.floor(clock / 1000) + 300, key = secret) => signTwitchJwt({
  exp: expSeconds, opaque_user_id: 'U123', channel_id: channelId, role: 'viewer', pubsub_perms: { listen: ['broadcast'] },
}, key);
assert.deepEqual(verifyTwitchJwt(viewerJwt('42'), secret, clock), { channelId: '42', role: 'viewer', opaqueUserId: 'U123' });
assert.equal(verifyTwitchJwt(viewerJwt('42', Math.floor(clock / 1000) - 1), secret, clock), null, 'expired');
assert.equal(verifyTwitchJwt(viewerJwt('42', undefined, randomBytes(32)), secret, clock), null, 'foreign secret');
const [, payloadPart] = viewerJwt('42').split('.');
const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
assert.equal(verifyTwitchJwt(`${noneHeader}.${payloadPart}.`, secret, clock), null, 'alg none');

// Fake Twitch: OAuth token, users, revoke and Extension PubSub.
type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
let pubsubStatus = 204;
const fakeFetch = async (url: string, init: RequestInit): Promise<Response> => {
  calls.push({ url, init });
  if (url === 'https://id.twitch.tv/oauth2/token') {
    const body = new URLSearchParams(String(init.body));
    if (body.get('code') !== 'good-code' || body.get('client_secret') !== ENV.TWITCH_OAUTH_CLIENT_SECRET) {
      return new Response('{}', { status: 400 });
    }
    return Response.json({ access_token: 'user-access-token', token_type: 'bearer' });
  }
  if (url === 'https://api.twitch.tv/helix/users') {
    return Response.json({ data: [{ id: '4242', login: 'streamer', display_name: 'Streamer' }] });
  }
  if (url === 'https://id.twitch.tv/oauth2/revoke') return new Response(null, { status: 200 });
  if (url === 'https://api.twitch.tv/helix/extensions/pubsub') return new Response(null, { status: pubsubStatus });
  return new Response('unexpected', { status: 500 });
};

const database = new DatabaseSync(':memory:');
database.exec(`PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);
  INSERT INTO users(id) VALUES ('user-1'), ('user-2'), ('user-3');`);
const links = createTwitchLinkRepository(() => database);
const live = createTwitchLiveState(() => clock);
const twitch = createTwitchApi(config, fakeFetch, () => clock);
const token = (userId: string, scopes: ApplicationAuthScope[]): ApplicationToken => ({
  id: `token-${userId}`, familyId: 'family', clientId: 'manacost-tracker', userId, scopes,
  accessTokenHash: 'unused', refreshTokenHash: 'unused', accessExpiresAt: clock + 60_000,
  refreshExpiresAt: clock + 60_000, createdAt: clock, revokedAt: null, replacedById: null,
});
const tokens: Record<string, ApplicationToken> = {
  'write-1': token('user-1', ['tracker.write', 'profile.read']),
  'write-2': token('user-2', ['tracker.write', 'profile.read']),
  'read-only': token('user-1', ['profile.read']),
};
const accessTokens = {
  authenticate: (value: unknown, scopes: ApplicationAuthScope[]) => {
    const record = tokens[String(value)];
    if (!record) return null;
    return scopes.every(scope => record.scopes.includes(scope)) ? record : 'FORBIDDEN';
  },
} as Pick<ApplicationAuthManager, 'authenticate'>;
const userAuth = (request: express.Request) => {
  const id = request.headers['x-test-user'];
  return typeof id === 'string' && id ? { id } : null;
};
const setPrivateNoStore = (response: express.Response) => { response.set('Cache-Control', 'private, no-store'); };
const errors: string[] = [];

const buildApp = (configured: boolean) => {
  const app = express();
  app.use('/api/v1/twitch/ext', createTwitchExtensionCors(configured ? config : null));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', createTwitchApiRouter({
    config: configured ? config : null, twitch: configured ? twitch : null, accessTokens, links, live,
    linkUrl: 'https://hearthpulse.net/account/twitch', setPrivateNoStore, now: () => clock,
    onError: (scope, error) => errors.push(`${scope}: ${error instanceof Error ? error.message : error}`),
  }));
  app.use('/api', createTwitchAccountRouter({
    config: configured ? config : null, twitch: configured ? twitch : null, links, live, userAuth,
    setPrivateNoStore, secureCookies: true, now: () => clock,
  }));
  app.use(createTwitchLinkPageRouter());
  return app;
};

const listen = async (app: express.Express) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { server, origin: `http://127.0.0.1:${address.port}` };
};

const { server, origin } = await listen(buildApp(true));
const bare = await listen(buildApp(false));

const deckState = (seq: number, extra: Record<string, unknown> = {}) => ({
  v: 1,
  seq,
  mode: 'constructed',
  deck: {
    name: 'Pirate Warrior', hero: 'HERO_01', format: 'standard', left: 22,
    cards: [{ id: 'CORE_CS2_106', dbf: 69, cost: 1, name: 'Fiery War Axe', left: 1, total: 2 }],
  },
  game: { turn: 5 },
  ...extra,
});
const postState = (body: unknown, bearer = 'write-1', base = origin) => fetch(`${base}/api/v1/twitch/state`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const errorCode = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;
const decodeEnvelope = (text: string) => {
  const envelope = JSON.parse(text) as { v: number; seq: number; at: number; z: string };
  return { envelope, state: JSON.parse(gunzipSync(Buffer.from(envelope.z, 'base64')).toString('utf8')) };
};

try {
  // Unconfigured site: 503 and configured:false, nothing crashes.
  let response = await postState(deckState(1), 'write-1', bare.origin);
  assert.equal(response.status, 503);
  assert.equal(await errorCode(response), 'twitch_not_configured');
  response = await fetch(`${bare.origin}/api/v1/twitch/status`, { headers: { Authorization: 'Bearer write-1' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    configured: false, linked: false, login: null, displayName: null, linkUrl: 'https://hearthpulse.net/account/twitch',
  });
  response = await fetch(`${bare.origin}/api/v1/twitch/ext/snapshot`, { headers: { Authorization: `Bearer ${viewerJwt('4242')}` } });
  assert.equal(response.status, 503);
  response = await fetch(`${bare.origin}/api/account/twitch/connect`, { redirect: 'manual', headers: { 'x-test-user': 'user-1' } });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/profile/?twitch=not_configured#account-twitch');

  // Authorization of the app's token.
  response = await postState(deckState(1), 'nope');
  assert.equal(response.status, 401);
  assert.ok(response.headers.get('www-authenticate'));
  response = await postState(deckState(1), 'read-only');
  assert.equal(response.status, 403);
  response = await fetch(`${origin}/api/v1/twitch/status`);
  assert.equal(response.status, 401);

  // Not linked yet.
  response = await postState(deckState(1));
  assert.equal(response.status, 404);
  assert.equal(await errorCode(response), 'twitch_not_linked');

  // Linking: the /account/twitch address, the OAuth start and the callback.
  response = await fetch(`${origin}/account/twitch`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/profile/#account-twitch');
  response = await fetch(`${origin}/api/account/twitch/connect`, { redirect: 'manual' });
  assert.equal(response.status, 302, 'a signed-out visitor goes to the account page');
  assert.equal(response.headers.get('location'), '/profile/#account-twitch');

  const start = async (userId: string) => {
    const started = await fetch(`${origin}/api/account/twitch/connect`, { redirect: 'manual', headers: { 'x-test-user': userId } });
    assert.equal(started.status, 302);
    const authorize = new URL(String(started.headers.get('location')));
    assert.equal(`${authorize.origin}${authorize.pathname}`, 'https://id.twitch.tv/oauth2/authorize');
    assert.equal(authorize.searchParams.get('client_id'), ENV.TWITCH_EXTENSION_CLIENT_ID);
    assert.equal(authorize.searchParams.get('redirect_uri'), ENV.TWITCH_OAUTH_REDIRECT_URI);
    assert.equal(authorize.searchParams.get('response_type'), 'code');
    assert.equal(authorize.searchParams.get('scope'), '', 'no scope is requested');
    const setCookie = String(started.headers.get('set-cookie'));
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Secure/);
    return { state: String(authorize.searchParams.get('state')), cookie: setCookie.split(';')[0] };
  };
  const callback = (query: string, cookie: string, userId: string) => fetch(
    `${origin}/api/account/twitch/callback?${query}`,
    { redirect: 'manual', headers: { cookie, 'x-test-user': userId } },
  );

  let flow = await start('user-1');
  response = await callback(`code=good-code&state=${flow.state}x`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/profile/?twitch=error#account-twitch', 'state mismatch');
  response = await callback(`code=good-code&state=${flow.state}`, '', 'user-1');
  assert.equal(response.headers.get('location'), '/profile/?twitch=error#account-twitch', 'no state cookie (CSRF)');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-2');
  assert.equal(response.headers.get('location'), '/profile/?twitch=error#account-twitch', 'started by another account');
  flow = await start('user-1');
  response = await callback(`error=access_denied&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/profile/?twitch=cancelled#account-twitch');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/profile/?twitch=error#account-twitch', 'a state is used once');
  flow = await start('user-1');
  clock += 11 * 60_000;
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/profile/?twitch=error#account-twitch', 'expired state');
  flow = await start('user-1');
  response = await callback(`code=bad-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/profile/?twitch=error#account-twitch', 'Twitch refused the code');
  assert.equal(links.find('user-1'), null);

  calls.length = 0;
  flow = await start('user-1');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/profile/?twitch=linked#account-twitch');
  assert.match(String(response.headers.get('set-cookie')), /hp_twitch_oauth=;.*Max-Age=0/, 'the state cookie is spent');
  assert.equal(links.find('user-1')?.twitchUserId, '4242');
  const usersCall = calls.find(call => call.url === 'https://api.twitch.tv/helix/users');
  assert.equal(new Headers(usersCall?.init.headers).get('client-id'), ENV.TWITCH_EXTENSION_CLIENT_ID);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.some(call => call.url === 'https://id.twitch.tv/oauth2/revoke'), 'the user token is not kept');

  response = await fetch(`${origin}/api/account/twitch`, { headers: { 'x-test-user': 'user-1' } });
  assert.deepEqual({ ...(await response.json() as object), linkedAt: 'x' }, {
    configured: true, linked: true, login: 'streamer', displayName: 'Streamer', linkedAt: 'x', chatCommands: false,
  });
  response = await fetch(`${origin}/api/account/twitch`);
  assert.equal(response.status, 401);
  response = await fetch(`${origin}/api/v1/twitch/status`, { headers: { Authorization: 'Bearer write-1' } });
  assert.deepEqual(await response.json(), {
    configured: true, linked: true, login: 'streamer', displayName: 'Streamer', linkUrl: 'https://hearthpulse.net/account/twitch',
  });

  // Validation.
  for (const invalid of [
    { ...deckState(1), v: 2 },
    { ...deckState(1), seq: -1 },
    { ...deckState(1), mode: 'battlegrounds' },
    { ...deckState(1), deck: { ...deckState(1).deck, format: 'arena' } },
    { ...deckState(1), deck: { ...deckState(1).deck, cards: [{ id: 'X', dbf: 1, cost: 1, name: '', left: 1, total: 1 }] } },
    { ...deckState(1), game: { turn: 'five' } },
    [],
  ]) {
    response = await postState(invalid);
    assert.equal(response.status, 400, JSON.stringify(invalid));
    assert.equal(await errorCode(response), 'invalid_state');
  }
  response = await postState({ v: 1, seq: 1, mode: 'constructed', pad: 'x'.repeat(17 * 1024) });
  assert.equal(response.status, 413, 'body above 16 KB');
  const noisyCards = Array.from({ length: 80 }, (_, index) => ({
    id: `CARD_${index}`, dbf: index, cost: index % 10, name: randomBytes(40).toString('hex'), left: 1, total: 2,
  }));
  response = await postState({ ...deckState(1), deck: { ...deckState(1).deck, cards: noisyCards } });
  assert.equal(response.status, 413, 'compressed envelope above 5 KB');
  assert.equal(await errorCode(response), 'payload_too_large');

  // A valid state reaches Helix with an external JWT and becomes the snapshot.
  calls.length = 0;
  clock += 5_000;
  response = await postState(deckState(42, { hand: ['SECRET_CARD'], opponent: { deck: [] } }));
  assert.equal(response.status, 204);
  assert.equal(calls.length, 1);
  const [pubsub] = calls;
  assert.equal(pubsub.url, 'https://api.twitch.tv/helix/extensions/pubsub');
  const headers = new Headers(pubsub.init.headers);
  assert.equal(headers.get('client-id'), ENV.TWITCH_EXTENSION_CLIENT_ID);
  const jwt = String(headers.get('authorization')).replace(/^Bearer /, '');
  const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.role, 'external');
  assert.equal(claims.channel_id, '4242');
  assert.equal(claims.user_id, ENV.TWITCH_EXTENSION_OWNER_ID);
  assert.deepEqual(claims.pubsub_perms, { send: ['broadcast'] });
  assert.equal(claims.exp, Math.floor(clock / 1000) + 60);
  assert.ok(verifyTwitchJwt(jwt, secret, clock), 'signed with the decoded extension secret');
  const pubsubBody = JSON.parse(String(pubsub.init.body));
  assert.deepEqual(pubsubBody.target, ['broadcast']);
  assert.equal(pubsubBody.broadcaster_id, '4242');
  const sent = decodeEnvelope(pubsubBody.message);
  assert.equal(sent.envelope.v, 1);
  assert.equal(sent.envelope.seq, 42);
  assert.equal(sent.envelope.at, clock);
  const { v: _v, seq: _seq, ...expectedState } = deckState(42);
  assert.deepEqual(sent.state, expectedState, 'only contract fields are forwarded, without v/seq');
  assert.ok(!pubsubBody.message.includes('SECRET_CARD'));

  // One per second per channel.
  response = await postState(deckState(43));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '1');
  assert.equal(await errorCode(response), 'rate_limited');
  clock += 1_000;

  // Snapshot for viewers: JWT, CORS for the extension origin only, no-store.
  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`, {
    method: 'OPTIONS',
    headers: { Origin: EXT_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), EXT_ORIGIN);
  assert.match(String(response.headers.get('access-control-allow-headers')), /Authorization/);
  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`, {
    headers: { Origin: EXT_ORIGIN, Authorization: `Bearer ${viewerJwt('4242')}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), EXT_ORIGIN);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(decodeEnvelope(await response.text()).envelope.seq, 42);
  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`, {
    headers: { Origin: 'https://evil.example', Authorization: `Bearer ${viewerJwt('4242')}` },
  });
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  await response.arrayBuffer();
  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`, { headers: { Authorization: `Bearer ${viewerJwt('7')}` } });
  assert.equal(response.status, 204, 'another channel has nothing');
  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`, { headers: { Authorization: 'Bearer forged.token.here' } });
  assert.equal(response.status, 401);
  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`);
  assert.equal(response.status, 401);

  // mode none is relayed as is.
  calls.length = 0;
  response = await postState({ v: 1, seq: 44, mode: 'none' });
  assert.equal(response.status, 204);
  assert.deepEqual(decodeEnvelope(JSON.parse(String(calls[0].init.body)).message).state, { mode: 'none' });
  clock += 1_000;

  // Helix failure: 503 twitch_unavailable, no secret in the logged error.
  pubsubStatus = 500;
  response = await postState(deckState(45));
  assert.equal(response.status, 503);
  assert.equal(await errorCode(response), 'twitch_unavailable');
  assert.ok(errors.length > 0);
  assert.ok(errors.every(line => !line.includes(SECRET_B64) && !line.includes(ENV.TWITCH_OAUTH_CLIENT_SECRET) && !line.includes('user-access-token')));
  pubsubStatus = 204;
  clock += 1_000;

  // The snapshot expires after 30 minutes.
  response = await postState(deckState(46));
  assert.equal(response.status, 204);
  clock += 30 * 60_000 + 1;
  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`, { headers: { Authorization: `Bearer ${viewerJwt('4242')}` } });
  assert.equal(response.status, 204);

  // The same Twitch account linked by another site account moves there.
  flow = await start('user-2');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-2');
  assert.equal(response.headers.get('location'), '/profile/?twitch=linked#account-twitch');
  assert.equal(links.find('user-1'), null);
  assert.equal(links.find('user-2')?.twitchUserId, '4242');

  // Chat commands (docs/specs/chat-commands.md): off for every link until the streamer switches them on.
  assert.equal(links.findByLogin('STREAMER')?.userId, 'user-2', 'the login lookup is case-insensitive');
  assert.equal(links.findByLogin('STREAMER')?.chatCommands, false);
  const chatSwitch = (body: unknown, user?: string) => fetch(`${origin}/api/account/twitch/chat-commands`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: JSON.stringify(body) });
  assert.equal((await chatSwitch({ enabled: true })).status, 401);
  assert.equal((await chatSwitch({ enabled: 'yes' }, 'user-2')).status, 400);
  assert.equal((await chatSwitch({ enabled: true }, 'user-9')).status, 404, 'no link, no switch');
  response = await chatSwitch({ enabled: true }, 'user-2');
  assert.deepEqual(await response.json(), { chatCommands: true });
  assert.equal(links.findByLogin('streamer')?.chatCommands, true);
  response = await fetch(`${origin}/api/account/twitch`, { headers: { 'x-test-user': 'user-2' } });
  assert.equal((await response.json()).chatCommands, true);
  assert.equal(JSON.parse([...links.exportRows('user-2')][0]).chatCommands, true, 'the data export carries the switch');
  // The stored envelope reads back into the state the app sent.
  clock += 1_000;
  assert.equal((await postState(deckState(46), 'write-2')).status, 204);
  const read = readTwitchEnvelope(live.snapshot('4242') as string);
  assert.equal(read?.state.mode, 'constructed');
  assert.equal(read?.receivedAt, clock);
  assert.equal(readTwitchEnvelope('{"z":"bad"}'), null);

  // Unlinking stops relaying and forgets the snapshot.
  clock += 1_000;
  response = await postState(deckState(47), 'write-2');
  assert.equal(response.status, 204);
  response = await fetch(`${origin}/api/account/twitch`, { method: 'DELETE' });
  assert.equal(response.status, 401);
  response = await fetch(`${origin}/api/account/twitch`, { method: 'DELETE', headers: { 'x-test-user': 'user-2' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { linked: false });
  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`, { headers: { Authorization: `Bearer ${viewerJwt('4242')}` } });
  assert.equal(response.status, 204);
  response = await postState(deckState(48), 'write-2');
  assert.equal(response.status, 404);

  // Deleting the site account deletes its link.
  flow = await start('user-3');
  await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-3');
  assert.ok(links.find('user-3'));
  database.exec("DELETE FROM users WHERE id = 'user-3'");
  assert.equal(links.find('user-3'), null);
} finally {
  server.close();
  bare.server.close();
}

console.log('twitch extension routes: ok');
