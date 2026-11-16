import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  createApplicationAuthManager,
  createSqliteApplicationAuthRepository,
  initializeApplicationAuthRepository,
  type ApplicationAuthManager,
  type ApplicationAuthScope,
  type ApplicationToken,
} from '../server/modules/applicationAuth/public.js';
import {
  createTwitchAccountRevoker,
  createTwitchAccountRouter,
  createTwitchApi,
  createTwitchApiRouter,
  createTwitchChannelRevoker,
  createTwitchExtensionCors,
  createTwitchLinkRepository,
  createTwitchLiveState,
  readTwitchExtensionConfig,
  signTwitchJwt,
  TWITCH_ACCOUNT_PAGE,
  verifyTwitchJwt,
  type TwitchExtensionConfig,
} from '../server/modules/twitchExtension/public.js';
import {
  registerTwitchExtension,
  revokeTwitchAccount,
  revokeTwitchAccountsOutside,
  twitchExtensionPreflight,
  twitchStateStreamRequest,
} from '../server/app/registerTwitchExtension.js';
import { csrfRequestAllowed, requestTargetPath } from '../server/csrf.js';

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

/**
 * A viewer's extension, as far as it decides which frame to keep. `push` is the acceptance rule of
 * `FrameBuffer.push` in the Hearthpulse app repository (twitch-extension/src/buffer.ts), copied as is:
 *
 *   const newer = frame.seq > this.lastSeq;
 *   const restarted = frame.seq < this.lastSeq && frame.at > this.lastAt;
 *   if (!newer && !restarted) return false;
 *   this.lastSeq = frame.seq;
 *   this.lastAt = frame.at;
 *
 * A frame the site relays in the right order is still lost if this rule drops it, so the tests below
 * feed every message Twitch accepted through it, in the order Twitch got them.
 */
type ViewerFrame = { seq: number; at: number; mode: string; accepted: boolean };
const createViewer = () => ({
  lastSeq: -1,
  lastAt: -1,
  shown: null as { seq: number; mode: string } | null,
  frames: [] as ViewerFrame[],
  push(frame: { seq: number; at: number }): boolean {
    const newer = frame.seq > this.lastSeq;
    const restarted = frame.seq < this.lastSeq && frame.at > this.lastAt;
    if (!newer && !restarted) return false;
    this.lastSeq = frame.seq;
    this.lastAt = frame.at;
    return true;
  },
  receive(message: string): void {
    const envelope = JSON.parse(message) as { seq: number; at: number; z: string };
    const mode = (JSON.parse(gunzipSync(Buffer.from(envelope.z, 'base64')).toString('utf8')) as { mode: string }).mode;
    const accepted = this.push(envelope);
    if (accepted) this.shown = { seq: envelope.seq, mode };
    this.frames.push({ seq: envelope.seq, at: envelope.at, mode, accepted });
  },
  /** The frames received since the mark. */
  since(mark: number): ViewerFrame[] {
    return this.frames.slice(mark);
  },
});
/** One viewer on each channel; `viewer` watches the main one, `otherViewer` the second. */
const viewers = new Map<string, ReturnType<typeof createViewer>>();
const viewerOf = (channelId: string) => {
  if (!viewers.has(channelId)) viewers.set(channelId, createViewer());
  return viewers.get(channelId) as ReturnType<typeof createViewer>;
};
const viewer = viewerOf('4242');
const otherViewer = viewerOf('5151');
/** The site's send time never repeats or goes back on a channel: that lets a lower `seq` through after a higher one. */
const assertSendTimesGrow = () => {
  for (const [channelId, watched] of viewers) {
    for (let index = 1; index < watched.frames.length; index++) {
      assert.ok(watched.frames[index].at > watched.frames[index - 1].at,
        `at grows strictly on ${channelId}: ${JSON.stringify(watched.frames.slice(index - 1, index + 1))}`);
    }
  }
};

// Fake Twitch: OAuth token, users, revoke and Extension PubSub.
type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
let pubsubStatus = 204;
const PUBSUB_URL = 'https://api.twitch.tv/helix/extensions/pubsub';
/**
 * While set, Twitch does not answer PubSub for `channel`; `arrived` is called when a held message
 * reaches it. Other channels are answered as usual.
 */
let pubsubGate: { channel: string; open: Promise<void>; arrived: () => void } | null = null;
/** Called once with the channel of the next PubSub message Twitch gets. */
let onPubsub: ((channelId: string) => void) | null = null;
const nextPubsub = () => new Promise<string>(resolve => {
  onPubsub = channelId => { onPubsub = null; resolve(channelId); };
});
const fakeFetch = async (url: string, init: RequestInit): Promise<Response> => {
  calls.push({ url, init });
  if (url === 'https://id.twitch.tv/oauth2/token' && new URLSearchParams(String(init.body)).get('code') === 'other-code') {
    return Response.json({ access_token: 'other-access-token', token_type: 'bearer' });
  }
  if (url === 'https://id.twitch.tv/oauth2/token') {
    const body = new URLSearchParams(String(init.body));
    if (body.get('code') !== 'good-code' || body.get('client_secret') !== ENV.TWITCH_OAUTH_CLIENT_SECRET) {
      return new Response('{}', { status: 400 });
    }
    return Response.json({ access_token: 'user-access-token', token_type: 'bearer' });
  }
  if (url === 'https://api.twitch.tv/helix/users') {
    // `other-code` signs in to a second Twitch account, so one site account can move between channels.
    return String(new Headers(init.headers).get('authorization')).endsWith('other-access-token')
      ? Response.json({ data: [{ id: '5151', login: 'second', display_name: 'Second' }] })
      : Response.json({ data: [{ id: '4242', login: 'streamer', display_name: 'Streamer' }] });
  }
  if (url === 'https://id.twitch.tv/oauth2/revoke') return new Response(null, { status: 200 });
  if (url === PUBSUB_URL) {
    const body = JSON.parse(String(init.body)) as { broadcaster_id: string; message: string };
    onPubsub?.(body.broadcaster_id);
    if (pubsubGate?.channel === body.broadcaster_id) {
      pubsubGate.arrived();
      await pubsubGate.open;
    }
    if (pubsubStatus < 300) viewerOf(body.broadcaster_id).receive(body.message);
    return new Response(null, { status: pubsubStatus });
  }
  return new Response('unexpected', { status: 500 });
};

const database = new DatabaseSync(':memory:');
database.exec(`PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);
  INSERT INTO users(id) VALUES ('user-1'), ('user-2'), ('user-3'), ('user-4');`);
const links = createTwitchLinkRepository(() => database);
const live = createTwitchLiveState(() => clock);
// The test learns that a send was queued from the queue itself, not from a guess about timing.
let onQueued: (() => void) | null = null;
const queueSend = live.run;
live.run = ((channelId, job) => {
  const result = queueSend(channelId, job);
  onQueued?.();
  return result;
}) as typeof live.run;
const queueState = live.runState;
live.runState = ((channelId, job) => {
  const result = queueState(channelId, job);
  if (result) onQueued?.();
  return result;
}) as typeof live.runState;
const nextQueued = () => new Promise<void>(resolve => {
  onQueued = () => { onQueued = null; resolve(); };
});
/** The waits a clear asked for instead of sleeping: the channel's one-a-second budget. */
const waits: number[] = [];
/** While set, a send that has to wait out the channel's second stays waiting; `waiting` tells it started to. */
let paceGate: { open: Promise<void>; waiting: () => void } | null = null;
const wait = async (milliseconds: number) => {
  waits.push(milliseconds);
  if (paceGate) {
    paceGate.waiting();
    await paceGate.open;
  }
};
const twitch = createTwitchApi(config, fakeFetch, () => clock);
const token = (userId: string, scopes: ApplicationAuthScope[]): ApplicationToken => ({
  id: `token-${userId}`, familyId: 'family', clientId: 'manacost-tracker', userId, scopes,
  accessTokenHash: 'unused', refreshTokenHash: 'unused', accessExpiresAt: clock + 60_000,
  refreshExpiresAt: clock + 60_000, createdAt: clock, revokedAt: null, replacedById: null,
});
const tokens: Record<string, ApplicationToken> = {
  'write-1': token('user-1', ['tracker.write', 'profile.read']),
  'write-2': token('user-2', ['tracker.write', 'profile.read']),
  'write-3': token('user-3', ['tracker.write', 'profile.read']),
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
/** Site accounts an administrator blocked: their app tokens stay valid, their sessions do not. */
const blocked = new Set<string>();
const LINK_URL = `https://hearthpulse.net${TWITCH_ACCOUNT_PAGE}`;

const buildApp = (configured: boolean) => {
  const app = express();
  app.use('/api/v1/twitch/ext', createTwitchExtensionCors(configured ? config : null));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', createTwitchApiRouter({
    config: configured ? config : null, twitch: configured ? twitch : null, accessTokens, links, live,
    linkUrl: LINK_URL, setPrivateNoStore, now: () => clock, accountActive: userId => !blocked.has(userId), wait,
    onError: (scope, error) => errors.push(`${scope}: ${error instanceof Error ? error.message : error}`),
  }));
  app.use('/api', createTwitchAccountRouter({
    config: configured ? config : null, twitch: configured ? twitch : null, links, live, userAuth,
    setPrivateNoStore, secureCookies: true, now: () => clock, wait,
    onError: (scope, error) => errors.push(`${scope}: ${error instanceof Error ? error.message : error}`),
  }));
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
    configured: false, linked: false, login: null, displayName: null, linkUrl: LINK_URL,
  });
  response = await fetch(`${bare.origin}/api/v1/twitch/ext/snapshot`, { headers: { Authorization: `Bearer ${viewerJwt('4242')}` } });
  assert.equal(response.status, 503);
  response = await fetch(`${bare.origin}/api/account/twitch/connect`, { redirect: 'manual', headers: { 'x-test-user': 'user-1' } });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/?login&twitch=not_configured#account-twitch');

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

  // Linking: the OAuth start and the callback. The site has no `/account/twitch` page.
  response = await fetch(`${origin}/account/twitch`, { redirect: 'manual' });
  assert.equal(response.status, 404);
  response = await fetch(`${origin}/api/account/twitch/connect`, { redirect: 'manual' });
  assert.equal(response.status, 302, 'a signed-out visitor goes to the account page');
  assert.equal(response.headers.get('location'), TWITCH_ACCOUNT_PAGE);

  const start = async (userId: string) => {
    const started = await fetch(`${origin}/api/account/twitch/connect`, { redirect: 'manual', headers: { 'x-test-user': userId } });
    assert.equal(started.status, 302);
    const authorize = new URL(String(started.headers.get('location')));
    assert.equal(`${authorize.origin}${authorize.pathname}`, 'https://id.twitch.tv/oauth2/authorize');
    assert.equal(authorize.searchParams.get('client_id'), ENV.TWITCH_EXTENSION_CLIENT_ID);
    assert.equal(authorize.searchParams.get('redirect_uri'), ENV.TWITCH_OAUTH_REDIRECT_URI);
    assert.equal(authorize.searchParams.get('response_type'), 'code');
    assert.equal(authorize.searchParams.get('scope'), '', 'no scope is requested');
    assert.equal(authorize.searchParams.get('force_verify'), 'true', 'Twitch always asks which account to link');
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
  assert.equal(response.headers.get('location'), '/?login&twitch=error#account-twitch', 'state mismatch');
  response = await callback(`code=good-code&state=${flow.state}`, '', 'user-1');
  assert.equal(response.headers.get('location'), '/?login&twitch=error#account-twitch', 'no state cookie (CSRF)');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-2');
  assert.equal(response.headers.get('location'), '/?login&twitch=error#account-twitch', 'started by another account');
  flow = await start('user-1');
  response = await callback(`error=access_denied&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/?login&twitch=cancelled#account-twitch');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/?login&twitch=error#account-twitch', 'a state is used once');
  flow = await start('user-1');
  clock += 11 * 60_000;
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/?login&twitch=error#account-twitch', 'expired state');
  flow = await start('user-1');
  response = await callback(`code=bad-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/?login&twitch=error#account-twitch', 'Twitch refused the code');
  assert.equal(links.find('user-1'), null);

  calls.length = 0;
  flow = await start('user-1');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(response.headers.get('location'), '/?login&twitch=linked#account-twitch');
  assert.match(String(response.headers.get('set-cookie')), /hp_twitch_oauth=;.*Max-Age=0/, 'the state cookie is spent');
  assert.equal(links.find('user-1')?.twitchUserId, '4242');
  const usersCall = calls.find(call => call.url === 'https://api.twitch.tv/helix/users');
  assert.equal(new Headers(usersCall?.init.headers).get('client-id'), ENV.TWITCH_EXTENSION_CLIENT_ID);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.some(call => call.url === 'https://id.twitch.tv/oauth2/revoke'), 'the user token is not kept');

  response = await fetch(`${origin}/api/account/twitch`, { headers: { 'x-test-user': 'user-1' } });
  assert.deepEqual({ ...(await response.json() as object), linkedAt: 'x' }, {
    configured: true, linked: true, login: 'streamer', displayName: 'Streamer', linkedAt: 'x',
  });
  response = await fetch(`${origin}/api/account/twitch`);
  assert.equal(response.status, 401);
  response = await fetch(`${origin}/api/v1/twitch/status`, { headers: { Authorization: 'Bearer write-1' } });
  assert.deepEqual(await response.json(), {
    configured: true, linked: true, login: 'streamer', displayName: 'Streamer', linkUrl: LINK_URL,
  });

  // Validation.
  for (const invalid of [
    { ...deckState(1), v: 2 },
    { ...deckState(1), seq: -1 },
    { ...deckState(1), mode: 'battlegrounds' },
    { ...deckState(1), deck: { ...deckState(1).deck, format: 'arena' } },
    { ...deckState(1), deck: { ...deckState(1).deck, name: 7 } },
    { ...deckState(1), deck: { ...deckState(1).deck, left: '22' } },
    ...[
      { id: 'bad id!', dbf: 1, cost: 1, name: 'A', left: 1, total: 1 },
      { id: 'X', dbf: 1, cost: 1, name: 7, left: 1, total: 1 },
      { id: 'X', dbf: 1, cost: 1, left: 1, total: 1 },
      { id: 'X', dbf: 1, cost: 1000, name: 'A', left: 1, total: 1 },
      { id: 'X', dbf: 1, cost: -1, name: 'A', left: 1, total: 1 },
      { id: 'X', dbf: 1, cost: 1, name: 'A', left: '1', total: 1 },
      { id: 'X', dbf: 1, cost: 1, name: 'A', left: 1, total: 1.5 },
    ].map(card => ({ ...deckState(1), deck: { ...deckState(1).deck, cards: [card] } })),
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

  // Display fields are tolerant: a real card above the usual ranges (GDB_142 costs 100), a card whose name
  // the app does not know, or copies shuffled past 30 must not hide the whole deck from viewers.
  calls.length = 0;
  clock += 5_000;
  response = await postState({
    ...deckState(41),
    deck: {
      ...deckState(41).deck,
      name: '   ',
      cards: [
        { id: 'GDB_142', dbf: 111914, cost: 100, name: 'Бескрайний простор', left: 1, total: 1 },
        { id: 'CORE_CS2_106', dbf: 69, cost: 1, name: '   ', left: 33, total: 33 },
        { id: 'EX1_001', dbf: 1, cost: 0, name: '', left: -1, total: 120, order: 3 },
      ],
    },
  });
  assert.equal(response.status, 204, 'partly incomplete display data is normalised, not refused');
  assert.deepEqual(decodeEnvelope(JSON.parse(String(calls[0].init.body)).message).state.deck, {
    name: null,
    hero: 'HERO_01',
    format: 'standard',
    left: 22,
    cards: [
      { id: 'GDB_142', dbf: 111914, cost: 100, name: 'Бескрайний простор', left: 1, total: 1 },
      { id: 'CORE_CS2_106', dbf: 69, cost: 1, name: 'CORE_CS2_106', left: 33, total: 33 },
      { id: 'EX1_001', dbf: 1, cost: 0, name: 'EX1_001', left: 0, total: 99 },
    ],
  }, 'an empty name becomes the card id, counts are clamped, an unknown field is dropped');
  // The deck counter is clamped to 0..999 the same way; the 16 KB body and 5 KB envelope limits still apply.
  for (const [sent, relayed] of [[1500, 999], [-5, 0], [999, 999]]) {
    calls.length = 0;
    clock += 1_000;
    response = await postState({ ...deckState(41), deck: { ...deckState(41).deck, left: sent } });
    assert.equal(response.status, 204);
    assert.equal(decodeEnvelope(JSON.parse(String(calls[0].init.body)).message).state.deck.left, relayed);
  }
  calls.length = 0;
  clock += 1_000;
  response = await postState({
    ...deckState(41),
    deck: { ...deckState(41).deck, cards: [{ id: 'X', dbf: 1, cost: 999, name: 'x'.repeat(200), left: 99, total: 100 }] },
  });
  assert.equal(response.status, 204);
  assert.deepEqual(decodeEnvelope(JSON.parse(String(calls[0].init.body)).message).state.deck.cards, [
    { id: 'X', dbf: 1, cost: 999, name: 'x'.repeat(80), left: 99, total: 99 },
  ], 'the upper bounds: cost 999, copies 99, a name of 80 characters');

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

  // What reached Extension PubSub since `calls` was emptied, decoded, in the order Twitch got it.
  const pubsubSent = () => calls.filter(call => call.url === PUBSUB_URL).map(call => {
    const body = JSON.parse(String(call.init.body)) as { broadcaster_id: string; message: string };
    return { channel: body.broadcaster_id, ...decodeEnvelope(body.message) };
  });
  const snapshotStatus = async (channel = '4242') => (await fetch(
    `${origin}/api/v1/twitch/ext/snapshot`, { headers: { Authorization: `Bearer ${viewerJwt(channel)}` } },
  )).status;
  const unlink = (userId: string) => fetch(`${origin}/api/account/twitch`, { method: 'DELETE', headers: { 'x-test-user': userId } });

  // The same Twitch account linked by another site account moves there. The deck the former account
  // relayed leaves the channel with its link: the snapshot at once, the viewers' screens by one `mode: none`.
  response = await postState(deckState(461));
  assert.equal(response.status, 204);
  assert.equal(await snapshotStatus(), 200, 'a fresh snapshot of the former owner');
  calls.length = 0;
  waits.length = 0;
  flow = await start('user-2');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-2');
  assert.equal(response.headers.get('location'), '/?login&twitch=linked#account-twitch');
  assert.equal(links.find('user-1'), null);
  assert.equal(links.find('user-2')?.twitchUserId, '4242');
  assert.equal(await snapshotStatus(), 204, 'the transfer forgets the former owner\'s snapshot');
  await live.idle('4242');
  let relayed = pubsubSent();
  assert.equal(relayed.length, 1, 'one clear for the transfer');
  assert.equal(relayed[0].channel, '4242');
  assert.deepEqual(relayed[0].state, { mode: 'none' });
  assert.ok(relayed[0].envelope.seq > 461, 'newer than the last frame relayed, or the extension would drop it');
  assert.deepEqual(viewer.frames.at(-1), { seq: relayed[0].envelope.seq, at: relayed[0].envelope.at, mode: 'none', accepted: true },
    'a viewer with the former owner\'s deck on screen takes the clear');
  assert.ok(relayed[0].envelope.at > viewer.frames.at(-2)!.at, 'in the same millisecond as deck 461, and still later for the viewer');
  assert.deepEqual(waits, [1_000], 'the clear waits out the channel\'s one-a-second budget');

  // A blocked site account neither publishes nor stays on the channel; its token is answered as invalid.
  // A viewer's request finds it first: one clear, and the requests that follow send nothing more.
  clock += 1_000;
  response = await postState(deckState(47), 'write-2');
  assert.equal(response.status, 204);
  blocked.add('user-2');
  calls.length = 0;
  assert.equal(await snapshotStatus(), 204, 'a blocked owner\'s snapshot is not served');
  await live.idle('4242');
  relayed = pubsubSent();
  assert.equal(relayed.length, 1, 'viewers are cleared when the block is first seen');
  assert.deepEqual(relayed[0].state, { mode: 'none' });
  assert.equal(await snapshotStatus(), 204);
  clock += 1_000;
  response = await postState(deckState(470), 'write-2');
  assert.equal(response.status, 401);
  assert.equal(await errorCode(response), 'INVALID_ACCESS_TOKEN');
  response = await fetch(`${origin}/api/v1/twitch/status`, { headers: { Authorization: 'Bearer write-2' } });
  assert.equal(response.status, 401);
  await live.idle('4242');
  assert.equal(pubsubSent().length, 1, 'no second clear and no deck: nothing more reaches Twitch for a blocked account');
  blocked.delete('user-2');
  assert.equal(await snapshotStatus(), 204, 'the snapshot was erased, not hidden');

  // The app's own request finds the block first: the same single clear. The owner's next deck after the
  // clear has a lower `seq` than the clear and is still what the viewer shows.
  clock += 1_000;
  response = await postState(deckState(472), 'write-2');
  assert.equal(response.status, 204);
  assert.deepEqual(viewer.shown, { seq: 472, mode: 'constructed' }, 'the same owner publishes again after a clear');
  blocked.add('user-2');
  calls.length = 0;
  clock += 1_000;
  response = await postState(deckState(473), 'write-2');
  assert.equal(response.status, 401);
  await live.idle('4242');
  assert.deepEqual(pubsubSent().map(message => message.state), [{ mode: 'none' }]);
  blocked.delete('user-2');

  // Unlinking stops relaying, forgets the snapshot and clears the viewers. Twitch refusing the clear
  // changes nothing: the link is gone, the snapshot is gone, the right to publish does not come back.
  clock += 1_000;
  response = await postState(deckState(474), 'write-2');
  assert.equal(response.status, 204);
  assert.equal(await snapshotStatus(), 200);
  response = await fetch(`${origin}/api/account/twitch`, { method: 'DELETE' });
  assert.equal(response.status, 401);
  calls.length = 0;
  errors.length = 0;
  pubsubStatus = 500;
  response = await unlink('user-2');
  assert.equal(response.status, 200, 'the unlink does not depend on Twitch');
  assert.deepEqual(await response.json(), { linked: false });
  await live.idle('4242');
  pubsubStatus = 204;
  relayed = pubsubSent();
  assert.equal(relayed.length, 1, 'the clear was tried once');
  assert.deepEqual(relayed[0].state, { mode: 'none' });
  assert.deepEqual(errors, ['pubsub-clear: Twitch pubsub failed with 500'], 'the failure is logged as operation and status only');
  assert.equal(links.find('user-2'), null);
  assert.equal(await snapshotStatus(), 204);
  clock += 1_000;
  response = await postState(deckState(48), 'write-2');
  assert.equal(response.status, 404, 'a failed clear does not give the link back');
  response = await unlink('user-2');
  assert.deepEqual(await response.json(), { linked: false });
  await live.idle('4242');
  assert.equal(pubsubSent().length, 1, 'unlinking again sends no second clear');

  // Deleting the site account deletes its link; the first viewer request after it clears the channel.
  flow = await start('user-3');
  await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-3');
  assert.ok(links.find('user-3'));
  clock += 1_000;
  response = await postState(deckState(49), 'write-3');
  assert.equal(response.status, 204);
  assert.equal(await snapshotStatus(), 200);
  database.exec("DELETE FROM users WHERE id = 'user-3'");
  assert.equal(links.find('user-3'), null);
  calls.length = 0;
  assert.equal(await snapshotStatus(), 204, 'the snapshot goes with the deleted account');
  assert.equal(await snapshotStatus(), 204);
  await live.idle('4242');
  assert.deepEqual(pubsubSent().map(message => message.state), [{ mode: 'none' }], 'one clear, however many viewers ask');
  assert.equal(await snapshotStatus('7'), 204);
  await live.idle('7');
  assert.equal(pubsubSent().length, 1, 'a channel nobody linked is never sent anything');

  // Order across a transfer. The former owner has one deck at Twitch (not answered yet) and one waiting
  // behind it when the channel moves; the new owner publishes at once. Twitch must get: the deck already
  // on its way, the clear, the new owner's deck. The waiting deck of the old link is dropped, and the
  // late clear cannot blank the new owner's deck because it is relayed before it.
  flow = await start('user-1');
  await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(links.find('user-1')?.twitchUserId, '4242');
  await live.idle('4242');
  clock += 1_000;
  calls.length = 0;
  let openGate = () => {};
  let atTwitch = () => {};
  const reachedTwitch = new Promise<void>(resolve => { atTwitch = resolve; });
  pubsubGate = { channel: '4242', open: new Promise<void>(resolve => { openGate = resolve; }), arrived: atTwitch };
  const onItsWay = postState(deckState(60));
  await reachedTwitch;
  clock += 1_000;
  let queued = nextQueued();
  const waiting = postState(deckState(61));
  await queued;
  flow = await start('user-2');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-2');
  assert.equal(response.headers.get('location'), '/?login&twitch=linked#account-twitch', 'the transfer does not wait for Twitch');
  assert.equal(links.find('user-2')?.twitchUserId, '4242');
  clock += 1_000;
  queued = nextQueued();
  const newOwner = postState(deckState(62), 'write-2');
  await queued;
  // Twitch answers the held deck half a second after the new owner's deck was accepted: the clear is
  // built and sent only now, later than deck 62 was received, and deck 62 follows it.
  clock += 500;
  const beforeRelease = viewer.frames.length;
  pubsubGate = null;
  openGate();
  assert.equal((await onItsWay).status, 204);
  response = await waiting;
  assert.equal(response.status, 404, 'a deck accepted under the old link is not sent after the link ended');
  assert.equal(await errorCode(response), 'twitch_not_linked');
  assert.equal((await newOwner).status, 204);
  await live.idle('4242');
  relayed = pubsubSent();
  assert.deepEqual(relayed.map(message => message.state.mode), ['constructed', 'none', 'constructed']);
  assert.deepEqual([relayed[0].envelope.seq, relayed[2].envelope.seq], [60, 62], 'deck 61 never reached Twitch');
  // Order alone is not enough: the viewer drops a frame whose `seq` is lower unless its `at` is later.
  // The clear's `seq` is the site's time, far above 62, so deck 62 must carry a later `at` than the clear.
  const afterRelease = viewer.since(beforeRelease);
  assert.deepEqual(afterRelease.map(frame => [frame.mode, frame.accepted]), [['constructed', true], ['none', true], ['constructed', true]],
    `the viewer keeps the former owner's last deck, the clear and the new owner's first deck: ${JSON.stringify(afterRelease)}`);
  assert.deepEqual(viewer.shown, { seq: 62, mode: 'constructed' }, 'and shows the new owner\'s deck at once, not at the next keepalive');
  assert.ok(relayed[1].envelope.seq > 62 && relayed[2].envelope.at > relayed[1].envelope.at);

  // The same owner going on: consecutive decks, two in one millisecond, a keepalive of the same deck.
  const beforeSteady = viewer.frames.length;
  for (const seq of [63, 64, 65]) {
    clock += 1_000;
    response = await postState(deckState(seq), 'write-2');
    assert.equal(response.status, 204);
  }
  assert.deepEqual(viewer.since(beforeSteady).map(frame => frame.accepted), [true, true, true]);
  assert.deepEqual(viewer.shown, { seq: 65, mode: 'constructed' });

  response = await fetch(`${origin}/api/v1/twitch/ext/snapshot`, { headers: { Authorization: `Bearer ${viewerJwt('4242')}` } });
  assert.equal(response.status, 200);
  assert.equal(decodeEnvelope(await response.text()).envelope.seq, 65, 'the new owner\'s newest deck is what a late viewer gets');
  assertSendTimesGrow();

  // A site account moves to another Twitch channel: the channel it leaves is cleared, the new one is not.
  calls.length = 0;
  flow = await start('user-2');
  response = await callback(`code=other-code&state=${flow.state}`, flow.cookie, 'user-2');
  assert.equal(response.headers.get('location'), '/?login&twitch=linked#account-twitch');
  assert.equal(links.find('user-2')?.twitchUserId, '5151');
  await live.idle('4242');
  await live.idle('5151');
  assert.deepEqual(pubsubSent().map(message => [message.channel, message.state.mode]), [['4242', 'none']]);
  assert.equal(viewer.shown?.mode, 'none');
  assert.equal(await snapshotStatus(), 204);

  // Unlinking long after the last deck: no snapshot is left (30 minutes), the clear is sent all the same.
  flow = await start('user-1');
  await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  await live.idle('4242');
  clock += 1_000;
  assert.equal((await postState(deckState(66))).status, 204);
  clock += 31 * 60_000;
  assert.equal(live.sweep(), 0, 'nothing is remembered');
  calls.length = 0;
  assert.equal((await unlink('user-1')).status, 200);
  await live.idle('4242');
  relayed = pubsubSent();
  assert.deepEqual(relayed.map(message => message.state), [{ mode: 'none' }]);
  assert.equal(relayed[0].envelope.seq, relayed[0].envelope.at, 'with nothing remembered the clear counts from the site\'s time');
  assert.equal(viewer.shown?.mode, 'none', 'and still clears a viewer whose app counts from its own start time');

  // The app's clock ahead of the site's. The clear takes the next `seq` after the last deck, and the one
  // frame that repeats that `seq` is the documented loss: the viewer drops it and shows the frame after it.
  flow = await start('user-1');
  await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  await live.idle('4242');
  const ahead = clock + 3_600_000;
  clock += 1_000;
  assert.equal((await postState(deckState(ahead))).status, 204);
  calls.length = 0;
  assert.equal((await unlink('user-1')).status, 200);
  await live.idle('4242');
  relayed = pubsubSent();
  assert.equal(relayed[0].envelope.seq, ahead + 1, 'newer than the last deck although the site\'s time is behind it');
  assert.ok(relayed[0].envelope.at < ahead);
  assert.deepEqual(viewer.shown, { seq: ahead + 1, mode: 'none' });
  flow = await start('user-1');
  await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  await live.idle('4242');
  clock += 1_000;
  assert.equal((await postState(deckState(ahead + 1))).status, 204);
  assert.equal(viewer.frames.at(-1)?.accepted, false, 'a frame with the clear\'s own seq is dropped by the viewer');
  assert.equal(viewer.shown?.mode, 'none');
  clock += 1_000;
  assert.equal((await postState(deckState(ahead + 2))).status, 204);
  assert.deepEqual(viewer.shown, { seq: ahead + 2, mode: 'constructed' }, 'the next seq brings the deck back');

  // The wait for the channel's second is a gap inside a send: the state has passed its checks and is not
  // stored or sent yet. A link that ends in that gap must not be published after all. The wait itself is
  // held here (not the broadcast: a message already at Twitch cannot be taken back, that is another case).
  const holdPace = () => {
    let open = () => {};
    let started = () => {};
    const waiting = new Promise<void>(resolve => { started = resolve; });
    paceGate = { open: new Promise<void>(resolve => { open = resolve; }), waiting: started };
    return { waiting, release: () => { paceGate = null; open(); } };
  };
  // A clear sent this very millisecond, then the link again: the owner's next state has to wait a second.
  const linkRightAfterAClear = async () => {
    clock += 1_000;
    assert.equal((await unlink('user-1')).status, 200);
    await live.idle('4242');
    flow = await start('user-1');
    await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
    assert.equal(links.find('user-1')?.twitchUserId, '4242');
    await live.idle('4242');
    calls.length = 0;
  };

  // Unlinked during the wait.
  await linkRightAfterAClear();
  let pace = holdPace();
  let stale = postState(deckState(ahead + 3));
  await pace.waiting;
  assert.equal((await unlink('user-1')).status, 200);
  assert.equal(await snapshotStatus(), 204);
  pace.release();
  response = await stale;
  assert.equal(response.status, 404, 'a state whose link ended while it waited for the channel\'s second is not sent');
  assert.equal(await errorCode(response), 'twitch_not_linked');
  await live.idle('4242');
  assert.deepEqual(pubsubSent().map(message => message.state.mode), ['none'], 'Twitch gets the clear and not the old deck');
  assert.equal(live.tracks('4242'), false, 'and the snapshot is not brought back');
  assert.equal(await snapshotStatus(), 204);
  flow = await start('user-1');
  await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');

  // Moved to another site account during the wait: the new owner's viewers never get the former owner's deck.
  await linkRightAfterAClear();
  pace = holdPace();
  stale = postState(deckState(ahead + 4));
  await pace.waiting;
  flow = await start('user-4');
  response = await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-4');
  assert.equal(links.find('user-4')?.twitchUserId, '4242');
  assert.equal(await snapshotStatus(), 204, 'nothing for the new owner\'s viewers while the old state still waits');
  pace.release();
  response = await stale;
  assert.equal(response.status, 404);
  await live.idle('4242');
  assert.deepEqual(pubsubSent().map(message => message.state.mode), ['none']);
  assert.equal(live.tracks('4242'), false, 'the new owner\'s channel holds no deck of the former owner');
  assert.equal(await snapshotStatus(), 204, 'and its viewers get one only when the new owner publishes');
  flow = await start('user-1');
  await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-1');
  assert.equal(links.find('user-1')?.twitchUserId, '4242');
  await live.idle('4242');

  // Blocked during the wait.
  await linkRightAfterAClear();
  pace = holdPace();
  stale = postState(deckState(ahead + 5));
  await pace.waiting;
  blocked.add('user-1');
  pace.release();
  response = await stale;
  assert.equal(response.status, 401, 'an account blocked while its state waited does not publish it');
  assert.equal(await errorCode(response), 'INVALID_ACCESS_TOKEN');
  await live.idle('4242');
  assert.deepEqual(pubsubSent(), [], 'nothing reached Twitch');
  assert.equal(live.tracks('4242'), false);
  blocked.delete('user-1');

  // A bounded queue. Twitch does not answer channel 4242: one state is at Twitch, one waits, and every
  // further one is refused at once instead of holding an open request. Channel 5151 is not held up.
  let release = () => {};
  let held = () => {};
  let heldAtTwitch = new Promise<void>(resolve => { held = resolve; });
  pubsubGate = { channel: '4242', open: new Promise<void>(resolve => { release = resolve; }), arrived: held };
  calls.length = 0;
  clock += 1_000;
  const atTwitchNow = postState(deckState(ahead + 10));
  await heldAtTwitch;
  clock += 1_000;
  let inQueue = nextQueued();
  const behindIt = postState(deckState(ahead + 11));
  await inQueue;
  for (const seq of [ahead + 12, ahead + 13, ahead + 14]) {
    clock += 1_000;
    // Answered or queued, whichever happens first: a state that got into the queue would never answer here.
    const becameQueued = nextQueued().then(() => 'queued');
    const third = postState(deckState(seq));
    assert.equal(await Promise.race([third.then(() => 'answered'), becameQueued]), 'answered',
      'a third state is refused at once, not queued behind the two the channel already holds');
    onQueued = null;
    response = await third;
    assert.equal(response.status, 429, 'no third state is held for a channel');
    assert.equal(response.headers.get('retry-after'), '1');
    assert.equal(await errorCode(response), 'rate_limited');
  }
  response = await postState(deckState(900), 'write-2');
  assert.equal(response.status, 204, 'another channel is sent while this one waits for Twitch');
  assert.deepEqual(otherViewer.shown, { seq: 900, mode: 'constructed' });
  assert.equal((await unlink('user-1')).status, 200, 'and an unlink is not refused by the bound');
  pubsubGate = null;
  release();
  assert.equal((await atTwitchNow).status, 204);
  assert.equal((await behindIt).status, 404, 'the waiting state belonged to the link that was just removed');
  await live.idle('4242');
  assert.deepEqual(pubsubSent().filter(message => message.channel === '4242').map(message => [message.envelope.seq === ahead + 10, message.state.mode]),
    [[true, 'constructed'], [false, 'none']], 'Twitch got the state that was on its way and the clear, nothing refused or dropped');

  // A failed send does not stop the channel's queue.
  clock += 1_000;
  pubsubStatus = 500;
  assert.equal((await postState(deckState(901), 'write-2')).status, 503);
  pubsubStatus = 204;
  clock += 1_000;
  assert.equal((await postState(deckState(902), 'write-2')).status, 204);
  assert.deepEqual(otherViewer.shown, { seq: 902, mode: 'constructed' });

  // A state already accepted when its account is blocked. Nothing revoked the channel (as if the block
  // reached the database some other way): the state asks again when its turn comes, is not sent, and
  // the channel is cleared.
  heldAtTwitch = new Promise<void>(resolve => { held = resolve; });
  pubsubGate = { channel: '5151', open: new Promise<void>(resolve => { release = resolve; }), arrived: held };
  calls.length = 0;
  clock += 1_000;
  const beforeBlock = postState(deckState(903), 'write-2');
  await heldAtTwitch;
  clock += 1_000;
  inQueue = nextQueued();
  const inherited = postState(deckState(904), 'write-2');
  await inQueue;
  blocked.add('user-2');
  pubsubGate = null;
  release();
  assert.equal((await beforeBlock).status, 204);
  response = await inherited;
  assert.equal(response.status, 401, 'accepted before the block, refused when its turn came');
  assert.equal(await errorCode(response), 'INVALID_ACCESS_TOKEN');
  await live.idle('5151');
  assert.deepEqual(pubsubSent().map(message => [message.envelope.seq === 903, message.state.mode]), [[true, 'constructed'], [false, 'none']]);
  assert.equal(otherViewer.shown?.mode, 'none');
  blocked.delete('user-2');

  // The site's real `authenticate`, not the stand-in above. It refuses a blocked or deleted account by
  // itself and revokes its tokens, so the app's request never reaches the Twitch routes: the channel is
  // taken away by the place that blocks or deletes the account (server/index.ts calls these two).
  initializeApplicationAuthRepository(() => database);
  const realAuth = createApplicationAuthManager({
    repository: createSqliteApplicationAuthRepository(() => database),
    // As server/index.ts resolves it: the account exists and is not blocked.
    isAccountActive: userId => !blocked.has(userId) && Boolean(database.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)),
    clients: [{ id: 'manacost-tracker', name: 'Manacost Tracker', scopes: ['profile.read', 'tracker.write'] }],
    verificationUri: 'https://hearthpulse.net/connect',
    now: () => clock,
  });
  const appToken = (userId: string) => {
    const device = realAuth.begin({ clientId: 'manacost-tracker', scope: 'profile.read tracker.write' });
    assert.equal(realAuth.approve({ userCode: device.userCode, userId }), true);
    const pair = realAuth.exchangeDevice({ clientId: 'manacost-tracker', deviceCode: device.deviceCode });
    assert.equal(pair.ok, true);
    return pair.ok ? pair.accessToken : '';
  };
  const logged: string[] = [];
  const onRealError = (scope: string, error: unknown) => logged.push(`${scope}: ${error instanceof Error ? error.message : error}`);
  const realApp = express();
  realApp.use(express.json({ limit: '1mb' }));
  realApp.use('/api/v1', createTwitchApiRouter({
    config, twitch, accessTokens: realAuth, links, live, linkUrl: LINK_URL, setPrivateNoStore, now: () => clock,
    accountActive: userId => !blocked.has(userId), wait, onError: onRealError,
  }));
  const accountRevoker = createTwitchAccountRevoker({ links, revoke: createTwitchChannelRevoker({ live, twitch, wait, onError: onRealError }) });
  const authSite = await listen(realApp);
  try {
    flow = await start('user-4');
    await callback(`code=good-code&state=${flow.state}`, flow.cookie, 'user-4');
    assert.equal(links.find('user-4')?.twitchUserId, '4242');
    await live.idle('4242');
    let bearer = appToken('user-4');
    clock += 1_000;
    assert.equal((await postState(deckState(ahead + 20), bearer, authSite.origin)).status, 204, 'a real token publishes');
    assert.deepEqual(viewer.shown, { seq: ahead + 20, mode: 'constructed' });

    // Blocked, with Twitch refusing the clear and no viewer asking for anything.
    calls.length = 0;
    pubsubStatus = 500;
    blocked.add('user-4');
    accountRevoker.account('user-4');
    await live.idle('4242');
    pubsubStatus = 204;
    assert.deepEqual(pubsubSent().map(message => [message.channel, message.state.mode]), [['4242', 'none']], 'the clear was tried at the block itself');
    assert.deepEqual(logged, ['pubsub-clear: Twitch pubsub failed with 500']);
    assert.equal(live.tracks('4242'), false, 'the snapshot is gone although Twitch refused the clear');
    clock += 1_000;
    response = await postState(deckState(ahead + 21), bearer, authSite.origin);
    assert.equal(response.status, 401, 'the real authenticate refuses the blocked account');
    blocked.delete('user-4');
    clock += 1_000;
    assert.equal((await postState(deckState(ahead + 22), bearer, authSite.origin)).status, 401, 'and its token stays revoked after the block is lifted');
    assert.equal(await snapshotStatus(), 204);
    await live.idle('4242');
    assert.equal(pubsubSent().length, 1, 'nothing else reached Twitch');

    // Deleted. The channel is read before the delete: the link goes by cascade with the account.
    bearer = appToken('user-4');
    clock += 1_000;
    assert.equal((await postState(deckState(ahead + 23), bearer, authSite.origin)).status, 204);
    assert.equal(await snapshotStatus(), 200);
    calls.length = 0;
    const keep = (database.prepare("SELECT id FROM users WHERE id <> 'user-4'").all() as Array<{ id: string }>).map(row => row.id);
    accountRevoker.accountsOutside(keep);
    database.prepare(`DELETE FROM users WHERE id NOT IN (${keep.map(() => '?').join(',')})`).run(...keep);
    assert.equal(links.find('user-4'), null);
    assert.equal(links.find('user-2')?.twitchUserId, '5151', 'the accounts that stay keep their links');
    await live.idle('4242');
    await live.idle('5151');
    assert.deepEqual(pubsubSent().map(message => [message.channel, message.state.mode]), [['4242', 'none']], 'one clear, for the deleted account\'s channel only');
    assert.equal(viewer.shown?.mode, 'none');
    assert.equal(live.tracks('4242'), false);
    clock += 1_000;
    assert.equal((await postState(deckState(ahead + 24), bearer, authSite.origin)).status, 401, 'the token went with the account');
    assert.equal(pubsubSent().length, 1);
  } finally {
    authSite.server.close();
  }
  assertSendTimesGrow();

  // Expired snapshots leave memory by the sweep, whatever the number of channels.
  const idle = createTwitchLiveState(() => clock);
  idle.store('1', 'first', { seq: 1, visible: true });
  clock += 29 * 60_000;
  idle.store('2', 'second', { seq: 2, visible: true });
  assert.equal(idle.sweep(), 2);
  clock += 2 * 60_000;
  assert.equal(idle.sweep(), 1, 'the first one is past 30 minutes');
  assert.equal(idle.snapshot('2'), 'second');
  clock += 30 * 60_000;
  assert.equal(idle.sweep(), 0);

  // Deployment contract. The origin nginx serves listed documents only and ends with
  // `location / { return 404; }`, so every address the site itself sends a browser or the app to
  // must be the home document (the account opens as `/?login`).
  const nginx = readFileSync(new URL('../deploy/nginx/arena-html-routing.conf', import.meta.url), 'utf8');
  assert.match(nginx, /\nlocation = \/ \{/, 'the home document is served');
  const targets = [TWITCH_ACCOUNT_PAGE, ...['linked', 'cancelled', 'error', 'not_configured']
    .map(result => `/?login&twitch=${result}#account-twitch`)];
  for (const target of targets) {
    const url = new URL(target, 'https://hearthpulse.net');
    assert.equal(url.pathname, '/', `${target} must be the home document`);
    assert.ok(url.searchParams.has('login'), `${target} must open the account`);
    assert.equal(url.hash, '#account-twitch', `${target} must open the Twitch block`);
  }
  assert.equal(new URL(LINK_URL).pathname, '/', 'the app gets the account address itself');
  assert.match(nginx, /\nlocation \/ \{\s*(?:[^}]*\s)?return 404;/, 'an unlisted path is a real 404');

  // The real composition order (server/index.ts): the global API limiter, the site-wide CORS, the CSRF
  // rule, the JSON parser, then registerTwitchExtension. First the order itself, read from the root...
  const root = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
  const order = [
    '|| !cookieMutationCsrfAllowed(req) || twitchStateStreamRequest(req.method, req.path)',
    "app.use('/api/', apiLimiter);",
    "if (req.method === 'OPTIONS' && !twitchExtensionPreflight(req.path)) return res.sendStatus(204);",
    'if (cookieMutationCsrfAllowed(req)) return next();',
    'registerTwitchExtension({ app,',
  ].map(marker => {
    assert.equal(root.split(marker).length, 2, `server/index.ts must have exactly one: ${marker}`);
    return root.indexOf(marker);
  });
  assert.deepEqual(order, [...order].sort((left, right) => left - right), 'limiter, CORS, CSRF, then the extension');

  // ...then its behaviour, with the same predicates and the same registration behind stand-ins in that order.
  const composed = express();
  composed.use('/api/', rateLimit({
    windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
    skip: request => twitchStateStreamRequest(request.method, request.path),
  }));
  composed.use((request, result, next) => {
    result.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    result.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-CSRF-Request');
    if (request.method === 'OPTIONS' && !twitchExtensionPreflight(request.path)) return result.sendStatus(204);
    return next();
  });
  composed.use('/api/', (request, result, next) => (csrfRequestAllowed({
    method: request.method, path: requestTargetPath(request.originalUrl), authorization: request.headers.authorization,
    authCookiePresent: Boolean(request.headers.cookie), csrfHeader: request.headers['x-csrf-request'],
    origin: request.headers.origin, referer: request.headers.referer, secFetchSite: request.headers['sec-fetch-site'],
    appUrl: 'https://hearthpulse.net',
  }) ? next() : result.status(403).json({ error: 'csrf' })));
  composed.use(express.json({ limit: '1mb' }));
  registerTwitchExtension({
    app: composed, getDatabase: () => database, env: ENV, accessTokens: accessTokens as Pick<ApplicationAuthManager, 'authenticate'>,
    userAuth, accountActive: () => true, setPrivateNoStore, appUrl: 'https://hearthpulse.net', twitchFetch: fakeFetch,
  });
  // The two places that end an account are wired in server/index.ts: the blocking route's store and the
  // account store's delete, the latter before the rows go.
  assert.equal(root.split('revokeTwitchAccount(targetId);').length, 2);
  const blockStore = root.slice(root.indexOf('deleteUserSessions: (targetId, email) => {'), root.indexOf('setManualAccess: (targetId, access'));
  assert.match(blockStore, /DELETE FROM sessions[\s\S]*revokeTwitchAccount\(targetId\);/, 'blocking an account takes its channel away');
  const beforeDelete = root.indexOf('revokeTwitchAccountsOutside(keepIds);');
  const userDelete = root.indexOf('database.prepare(`DELETE FROM users WHERE id NOT IN');
  assert.ok(beforeDelete > 0 && beforeDelete < userDelete && userDelete - beforeDelete < 200, 'the channels are read right before the delete');
  assert.equal(root.split('DELETE FROM users').length, 2, 'and that is the only place accounts are deleted');
  // ...and they reach Twitch through the registration made above.
  assert.equal(links.find('user-2')?.twitchUserId, '5151');
  calls.length = 0;
  let cleared = nextPubsub();
  revokeTwitchAccount('user-2');
  assert.equal(await cleared, '5151');
  revokeTwitchAccount('user-1');
  cleared = nextPubsub();
  revokeTwitchAccountsOutside(['user-1']);
  assert.equal(await cleared, '5151');
  assert.deepEqual(pubsubSent().map(message => [message.channel, message.state.mode]), [['5151', 'none'], ['5151', 'none']],
    'an account without a link sends nothing');
  const real = await listen(composed);
  try {
    response = await fetch(`${real.origin}/api/v1/twitch/ext/snapshot`, {
      method: 'OPTIONS',
      headers: { Origin: EXT_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), EXT_ORIGIN, 'the extension preflight passes the site CORS');
    assert.equal(response.headers.get('access-control-allow-methods'), 'GET, OPTIONS', 'and gets the extension\'s own answer');
    assert.equal(response.headers.get('access-control-allow-headers'), 'Authorization');
    response = await fetch(`${real.origin}/api/v1/twitch/status`, { method: 'OPTIONS', headers: { Origin: EXT_ORIGIN } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), null, 'the app\'s routes are not opened to the extension origin');
    response = await fetch(`${real.origin}/api/v1/twitch/ext/snapshot`, { headers: { Origin: EXT_ORIGIN } });
    assert.equal(response.status, 401, 'the route is reached and asks for the viewer token');
    assert.equal(response.headers.get('access-control-allow-origin'), EXT_ORIGIN);

    const withCookie = { cookie: 'session=1', origin: 'https://hearthpulse.net', 'sec-fetch-site': 'same-origin', 'x-test-user': 'user-2' };
    response = await fetch(`${real.origin}/api/account/twitch`, { method: 'DELETE', headers: withCookie });
    assert.equal(response.status, 403, 'unlinking without X-CSRF-Request stops at the CSRF rule');
    assert.equal(links.find('user-2')?.twitchUserId, '5151', 'and unlinks nothing');
    response = await fetch(`${real.origin}/api/account/twitch`, {
      method: 'DELETE', headers: { ...withCookie, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'x-csrf-request': '1' },
    });
    assert.equal(response.status, 403, 'nor from another site');

    // The state stream is not counted by the 120-a-minute API limiter; everything else is.
    const stream = await Promise.all(Array.from({ length: 130 }, (_, index) => postState(deckState(700 + index), 'write-1', real.origin)));
    assert.deepEqual([...new Set(stream.map(item => item.status))], [404], '130 states in a row: not linked, never rate limited');
    await Promise.all(stream.map(item => item.arrayBuffer()));
    const others = await Promise.all(Array.from({ length: 125 }, () => fetch(
      `${real.origin}/api/v1/twitch/status`, { headers: { Authorization: 'Bearer write-1' } },
    )));
    await Promise.all(others.map(item => item.arrayBuffer()));
    assert.ok(others.some(item => item.status === 429), 'the API limiter is in front and counts the other routes');
  } finally {
    real.server.close();
  }
} finally {
  server.close();
  bare.server.close();
}

console.log('twitch extension routes: ok');
