import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  legacyTelegramIdentityPayload,
  normalizeTelegramLinkCode,
  telegramAuthMode,
  telegramLoginWidgetDataCheckString,
} from '../server/modules/telegramAuth/public.js';
import {
  consumeTelegramAuthIntent,
  createTelegramSignInIntent,
  parseTelegramAuthIntents,
} from '../server/modules/telegramAuth/intent.js';
import { createTelegramAuthIntentCookieManager } from '../server/modules/telegramAuth/intentCookie.js';
import {
  createTelegramOidcFlow,
  telegramOidcLinkUserId,
  type TelegramOidcState,
} from '../server/modules/telegramAuth/oidcFlow.js';
import { telegramAuthConfigRefreshDelay } from '../src/modules/identity/api/telegramAuthConfigApi.js';
import {
  telegramBotLinkResultFromPayload,
  telegramOidcLinkUrlFromPayload,
} from '../src/modules/identity/api/telegramLinkApi.js';

const NOW = 1_776_000_000_000;

assert.equal(telegramAuthMode({ oidcEnabled: true, legacyEnabled: true }), 'oidc');
assert.equal(telegramAuthMode({ oidcEnabled: true, legacyEnabled: false }), 'oidc');
assert.equal(telegramAuthMode({ oidcEnabled: false, legacyEnabled: true }), 'legacy-widget');
assert.equal(telegramAuthMode({ oidcEnabled: false, legacyEnabled: false }), 'disabled');

const strongLinkCode = `TG-${'Ab3_'.repeat(6)}`;
assert.equal(normalizeTelegramLinkCode(`/start ${strongLinkCode}`), strongLinkCode);
assert.equal(normalizeTelegramLinkCode(`/link ${strongLinkCode}`), strongLinkCode);
assert.equal(normalizeTelegramLinkCode(strongLinkCode), strongLinkCode);
assert.equal(normalizeTelegramLinkCode('TG-123456'), '', 'six-digit account-link secrets are too weak');
assert.equal(
  telegramAuthConfigRefreshDelay(NOW + 10 * 60_000, NOW),
  9 * 60_000,
  'the legacy widget must refresh its browser intent before the ten-minute expiry',
);
assert.equal(telegramAuthConfigRefreshDelay(NOW + 30_000, NOW), 30_000);
assert.equal(telegramAuthConfigRefreshDelay(0, NOW), null);
assert.deepEqual(telegramBotLinkResultFromPayload({
  code: strongLinkCode,
  expiresAt: new Date(NOW + 60_000).toISOString(),
  botUsername: '@manacost_auth_bot',
}, NOW), {
  code: strongLinkCode,
  expiresAt: new Date(NOW + 60_000).toISOString(),
  botUsername: 'manacost_auth_bot',
});
assert.throws(
  () => telegramBotLinkResultFromPayload({ code: '', expiresAt: '' }, NOW),
  /некорректный или устаревший/,
);
assert.equal(
  telegramOidcLinkUrlFromPayload({ authUrl: 'https://oauth.telegram.org/auth?state=safe' }),
  'https://oauth.telegram.org/auth?state=safe',
);
assert.throws(
  () => telegramOidcLinkUrlFromPayload({ authUrl: 'https://evil.example/phish' }),
  /безопасный адрес/,
);

const signInState: TelegramOidcState = {
  state: 'sign-in-state',
  nonce: 'sign-in-nonce',
  codeVerifier: 'sign-in-verifier',
  purpose: 'sign-in',
  returnTo: '/',
  expiresAt: NOW + 60_000,
};
const linkState: TelegramOidcState = {
  ...signInState,
  state: 'link-state',
  purpose: 'link',
  linkUserId: 'user_1',
  linkSessionHash: 'a'.repeat(64),
};
assert.equal(
  telegramOidcLinkUserId(signInState, { userId: 'ambient-user', sessionHash: 'b'.repeat(64) }),
  undefined,
  'ordinary sign-in must never become an ambient-session account link',
);
assert.equal(
  telegramOidcLinkUserId(linkState, { userId: 'user_1', sessionHash: 'a'.repeat(64) }),
  'user_1',
);
assert.throws(() => telegramOidcLinkUserId(linkState, null), /session no longer matches/);
assert.throws(
  () => telegramOidcLinkUserId(linkState, { userId: 'other-user', sessionHash: 'a'.repeat(64) }),
  /session no longer matches/,
);
assert.throws(
  () => telegramOidcLinkUserId(linkState, { userId: 'user_1', sessionHash: 'b'.repeat(64) }),
  /session no longer matches/,
);

{
  const intent = createTelegramSignInIntent({
    nonce: 'nonce-a',
    now: NOW,
    ttlMs: 10 * 60_000,
  });
  assert.deepEqual(intent, {
    kind: 'sign-in',
    nonce: 'nonce-a',
    expiresAt: NOW + 10 * 60_000,
  });
  assert.deepEqual(parseTelegramAuthIntents({ intents: [intent] }, NOW), [intent]);
  assert.deepEqual(parseTelegramAuthIntents({ intents: [intent] }, intent.expiresAt), []);
}

{
  type Request = { cookies: Record<string, string> };
  type Response = { cookies: string[] };
  let randomCounter = 0;
  const flow = createTelegramOidcFlow<Request, Response>({
    cookieName: '__Host-test_tg_oidc',
    legacyCookieName: 'test_tg_oidc',
    secret: 'test-secret',
    ttlMs: 60_000,
    clientId: 'client-id',
    redirectUri: 'https://arena.example/api/auth/telegram/callback',
    now: () => NOW,
    randomToken: bytes => `${bytes}-${++randomCounter}`,
    loadAuthorizationEndpoint: async () => 'https://oauth.telegram.org/auth',
    codeChallenge: verifier => `challenge-${verifier}`,
    safeReturnTo: value => String(value || '/'),
    readCookie: (request, name) => request.cookies[name] || '',
    appendSetCookie: (response, cookie) => response.cookies.push(cookie),
    secure: () => true,
    legacyDomain: () => 'Domain=.arena.example',
    encode: value => Buffer.from(JSON.stringify(value)).toString('base64url'),
    decode: value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
  });
  const request: Request = { cookies: {} };
  const response: Response = { cookies: [] };
  const authUrl = await flow.begin(request, response, {
    purpose: 'link',
    linkUserId: 'user_1',
    linkSessionHash: 'a'.repeat(64),
    returnTo: '/?login&telegram=linked',
  });
  const issuedCookie = response.cookies.find(cookie => cookie.startsWith('__Host-test_tg_oidc='));
  assert.match(issuedCookie ?? '', /Path=\/;.*HttpOnly; SameSite=Lax; Secure/);
  assert.doesNotMatch(issuedCookie ?? '', /Domain=/i);
  assert.ok(response.cookies.some(cookie => cookie.includes('test_tg_oidc=') && cookie.includes('Max-Age=0')));

  const state = new URL(authUrl).searchParams.get('state') || '';
  request.cookies['__Host-test_tg_oidc'] = decodeURIComponent(
    issuedCookie?.split(';', 1)[0].split('=').slice(1).join('=') || '',
  );
  assert.deepEqual(flow.take(request, response, state), {
    state: '24-1',
    nonce: '24-2',
    codeVerifier: '48-3',
    purpose: 'link',
    linkUserId: 'user_1',
    linkSessionHash: 'a'.repeat(64),
    returnTo: '/?login&telegram=linked',
    expiresAt: NOW + 60_000,
  });
}

{
  const first = createTelegramSignInIntent({ nonce: 'nonce-a', now: NOW, ttlMs: 60_000 });
  const second = createTelegramSignInIntent({ nonce: 'nonce-b', now: NOW, ttlMs: 60_000 });
  const consumed = consumeTelegramAuthIntent([first, second], 'nonce-a', NOW);
  assert.deepEqual(consumed.intent, first);
  assert.deepEqual(consumed.remaining, [second]);

  const replay = consumeTelegramAuthIntent(consumed.remaining, 'nonce-a', NOW);
  assert.equal(replay.intent, null);
  assert.deepEqual(replay.remaining, [second]);
}

{
  const dataCheckString = telegramLoginWidgetDataCheckString({
    returnTo: '/?login&telegram=linked',
    intent: 'application-state',
    id: '12345',
    oidc_sub: 'unsigned-oidc-subject',
    username: 'display_name',
    first_name: 'First',
    auth_date: '1776000000',
    hash: 'ignored',
    injected: 'must-not-be-signed',
  });
  assert.equal(dataCheckString, [
    'auth_date=1776000000',
    'first_name=First',
    'id=12345',
    'username=display_name',
  ].join('\n'));

  assert.deepEqual(legacyTelegramIdentityPayload({
    ...Object.fromEntries(dataCheckString.split('\n').map(line => line.split('=', 2))),
    oidc_sub: 'unsigned-oidc-subject',
    email: 'victim@example.com',
  }), {
    id: '12345',
    first_name: 'First',
    username: 'display_name',
  }, 'legacy identity input must drop every OIDC and application-owned field');
}

{
  type Request = { cookie: string };
  type Response = { cookies: string[] };
  let nonceCounter = 0;
  let secureCookie = true;
  const manager = createTelegramAuthIntentCookieManager<Request, Response>({
    cookieName: '__Host-test_tg_intent',
    path: '/',
    legacyCookieName: 'test_tg_intent',
    legacyPath: '/api/auth/telegram',
    secret: 'test-secret',
    ttlMs: 60_000,
    now: () => NOW,
    randomNonce: () => `nonce-${++nonceCounter}`,
    readCookie: request => request.cookie,
    appendSetCookie: (response, cookie) => response.cookies.push(cookie),
    secure: () => secureCookie,
    legacyDomain: () => 'Domain=.arena.example',
    encode: value => Buffer.from(JSON.stringify(value)).toString('base64url'),
    decode: value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
  });
  const request: Request = { cookie: '' };
  const response: Response = { cookies: [] };
  const intent = manager.issue(request, response);
  assert.equal(intent.nonce, 'nonce-1');
  assert.match(response.cookies[0] ?? '', /^__Host-test_tg_intent=.*Path=\/;.*HttpOnly; SameSite=Lax; Secure/);
  assert.doesNotMatch(response.cookies[0] ?? '', /Domain=/i);
  assert.ok(response.cookies.some(cookie => (
    cookie.startsWith('test_tg_intent=')
    && cookie.includes('Max-Age=0')
    && cookie.includes('Domain=.arena.example')
  )), 'the legacy domain cookie must be expired during the host-only migration');

  request.cookie = Buffer.from(JSON.stringify({ intents: [intent] })).toString('base64url');
  assert.deepEqual(manager.take(request, response, intent.nonce), intent);
  assert.match(response.cookies.at(-1) ?? '', /Max-Age=0/);
  request.cookie = '';
  assert.equal(manager.take(request, response, intent.nonce), null);
  secureCookie = false;
  assert.throws(
    () => manager.issue(request, response),
    /requires HTTPS and Path=\//,
    'a __Host- intent cookie must fail closed outside HTTPS',
  );
}

const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
assert.match(
  serverSource,
  /const legacyEnabled = telegramLegacyWidgetEnabled\(\);[\s\S]{0,500}if \(legacyEnabled\) \{[\s\S]{0,300}issueTelegramSignInIntent/,
  'OIDC+bot config must still issue the legacy POST/widget intent contract',
);
assert.match(
  serverSource,
  /legacyIntentExpiresAt = intent\.expiresAt/,
  'legacy clients need the server expiry to refresh a stale widget intent',
);
assert.match(
  serverSource,
  /randomBytes\(18\)\.toString\('base64url'\)/,
  'new bot link secrets must contain at least 128 bits of entropy',
);
assert.match(
  serverSource,
  /__Host-manacost_tg_oidc/,
  'production OIDC state must use a host-bound cookie prefix',
);
assert.match(
  serverSource,
  /__Host-manacost_tg_intent/,
  'production legacy intents must resist sibling-domain cookie tossing',
);
assert.match(
  serverSource,
  /linkSessionHash: activeSession\.session\.tokenHash/,
  'explicit OIDC linking must bind state to the initiating auth session',
);
assert.match(
  serverSource,
  /telegramOidcLinkUserId\(oidcState, activeSession/,
  'the callback must enforce the behavior-tested session binding helper',
);
assert.match(
  serverSource,
  /id: claims\.id \?\? ''[\s\S]{0,100}oidc_sub: claims\.sub \?\? ''/,
  'immutable OIDC claims must reach strict schema validation without string coercion',
);
assert.match(
  serverSource,
  /req\.path === '\/auth\/telegram\/bot\/webhook'/,
  'the shared-IP API limiter must not let one Telegram sender block all webhook traffic',
);
assert.match(
  serverSource,
  /app\.post\('\/api\/auth\/telegram\/bot\/webhook', telegramBotWebhookLimiter,/,
  'an authenticated webhook must then be rate-limited by Telegram sender',
);
const preAuthLimiterOffset = serverSource.indexOf(
  "app.use('/api/auth/telegram/bot/webhook', telegramBotWebhookPreAuthLimiter, telegramBotWebhookGuard)",
);
const jsonParserOffset = serverSource.indexOf('app.use(createRouteAwareJsonParser(');
assert.ok(
  preAuthLimiterOffset > 0 && preAuthLimiterOffset < jsonParserOffset,
  'invalid webhook traffic must hit an IP limiter and secret guard before JSON parsing',
);
assert.match(
  serverSource,
  /telegramBotWebhookPreAuthLimiter = rateLimit\([\s\S]{0,500}skip: req => Boolean\([\s\S]{0,300}safeEqualString/,
  'only requests with the configured secret may skip the pre-auth IP limiter',
);
assert.match(
  serverSource,
  /consumeTelegramAuthIntentAndClaimIdentities\(database,/,
  'legacy completion must atomically consume its nonce with identity claims',
);
assert.match(
  serverSource,
  /issueTelegramLinkToken\(db\(\), \{[\s\S]{0,200}sessionTokenHash: activeSession\.session\.tokenHash/,
  'bot link codes must bind to the exact issuing browser session',
);
assert.match(
  serverSource,
  /sessionTokenHash: token\.sessionTokenHash/,
  'bot token consumption must verify the persisted issuing-session hash',
);
assert.doesNotMatch(
  serverSource,
  /writeKhaVipProfiles|setKhaVipVerifiedEmail|createTelegramEmailOtpService/,
  'Arena must treat the KHA profile store as read-only and leave email verification to its owner',
);
assert.match(
  serverSource,
  /idx_identities_user_provider[\s\S]{0,80}identities\(user_id, provider\)/,
  'the public Telegram-linked flag must use an indexed identity lookup',
);

console.log('Telegram auth intent tests passed');
