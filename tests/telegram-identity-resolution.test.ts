import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assertTelegramAuthEnvironment,
  assertTelegramOidcAudience,
  createTelegramBotLinkService,
  createTelegramAuthUserResolver,
  telegramLinkCodeTtlMs,
  TelegramAuthIdentityError,
} from '../server/modules/telegramAuth/public.js';
import type {
  TelegramAuthIdentityProvider,
  TelegramAuthNewUser,
} from '../server/modules/telegramAuth/model.js';

type TestUser = {
  id: string;
  email: string;
  name: string;
  role: 'user';
  avatarInitials: string;
  telegramId?: string;
  telegramUsername?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type TestSession = {
  userId?: string;
  email: string;
};

type TestStore = {
  users: TestUser[];
  sessions: TestSession[];
};

type TestProfile = {
  email?: string;
  verified?: boolean;
};

const NOW = '2026-08-17T12:00:00.000Z';

assert.doesNotThrow(() => assertTelegramAuthEnvironment({
  botToken: 'token',
  botUsername: 'bot_name',
  oidcClientId: 'client-id',
  oidcClientSecret: 'client-secret',
}));
assert.throws(() => assertTelegramAuthEnvironment({
  botToken: 'token',
  botUsername: '',
  oidcClientId: '',
  oidcClientSecret: '',
}), /requires both TELEGRAM_AUTH_BOT_TOKEN/);
assert.throws(() => assertTelegramAuthEnvironment({
  botToken: '',
  botUsername: '',
  oidcClientId: 'client-id',
  oidcClientSecret: '',
}), /requires both TELEGRAM_OIDC_CLIENT_ID/);
assert.equal(telegramLinkCodeTtlMs(undefined), 15 * 60_000);
assert.equal(telegramLinkCodeTtlMs('invalid'), 15 * 60_000);
assert.equal(telegramLinkCodeTtlMs(1), 5 * 60_000);
assert.equal(telegramLinkCodeTtlMs(24 * 60 * 60_000), 60 * 60_000);
assert.doesNotThrow(() => assertTelegramOidcAudience({ aud: 'client-id' }, 'client-id'));
assert.doesNotThrow(() => assertTelegramOidcAudience({
  aud: ['client-id', 'other-client'],
  azp: 'client-id',
}, 'client-id'));
assert.throws(
  () => assertTelegramOidcAudience({ aud: ['client-id', 'other-client'] }, 'client-id'),
  /authorized party/,
);
assert.throws(
  () => assertTelegramOidcAudience({ aud: ['client-id', 'other-client'], azp: 'other-client' }, 'client-id'),
  /authorized party/,
);
assert.throws(
  () => assertTelegramOidcAudience({ aud: 'client-id', azp: 'other-client' }, 'client-id'),
  /authorized party/,
);
assert.throws(
  () => assertTelegramOidcAudience({ aud: 123 }, 'client-id'),
  /audience/,
);

function testUser(id: string, overrides: Partial<TestUser> = {}): TestUser {
  return {
    id,
    email: `${id}@example.com`,
    name: `User ${id}`,
    role: 'user',
    avatarInitials: 'US',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

{
  const target = testUser('bot-link-target');
  const emailOwner = testUser('boosty-owner', { email: 'member@example.com' });
  const store: TestStore = { users: [target, emailOwner], sessions: [] };
  const original = structuredClone(store);
  const resolve = testResolver({
    owners: [['boosty-email', 'member@example.com', emailOwner.id]],
    profiles: { '620': { email: 'member@example.com', verified: true } },
  });
  let persistCalls = 0;
  let persistedSessionHash = '';
  const link = createTelegramBotLinkService({
    now: () => Date.parse(NOW),
    findToken: code => code === 'TG-620000'
      ? {
          code,
          userId: target.id,
          sessionTokenHash: 'issuing-session-hash',
          expiresAt: Date.parse(NOW) + 60_000,
        }
      : undefined,
    resolve: (payload, linkUserId) => resolve({ store, payload, linkUserId }),
    persist: ({ token }) => {
      persistCalls += 1;
      persistedSessionHash = token.sessionTokenHash;
    },
  });

  expectIdentityError(
    () => link({ code: 'TG-620000', payload: { id: '620', username: 'bot_member' } }),
    'BOOSTY_IDENTITY_CONFLICT',
  );
  assert.equal(persistCalls, 0, 'a failed unified resolution must not consume the bot token');
  assert.equal(persistedSessionHash, '');
  assert.deepEqual(store, original);
}

{
  const target = testUser('bot-link-success');
  const store: TestStore = { users: [target], sessions: [] };
  const resolve = testResolver();
  let persistedSessionHash = '';
  const link = createTelegramBotLinkService({
    now: () => Date.parse(NOW),
    findToken: code => ({
      code,
      userId: target.id,
      sessionTokenHash: 'active-session-hash',
      expiresAt: Date.parse(NOW) + 60_000,
    }),
    resolve: (payload, linkUserId) => resolve({ store, payload, linkUserId }),
    persist: ({ token }) => { persistedSessionHash = token.sessionTokenHash; },
  });

  const result = link({ code: 'TG-valid', payload: { id: '621' } });
  assert.equal(result.user.id, target.id);
  assert.equal(persistedSessionHash, 'active-session-hash');
}

{
  let resolveCalls = 0;
  const link = createTelegramBotLinkService({
    now: () => Date.parse(NOW),
    findToken: () => ({
      code: 'TG-legacy',
      userId: 'target',
      expiresAt: Date.parse(NOW) + 60_000,
    } as any),
    resolve: () => {
      resolveCalls += 1;
      return { claims: [] };
    },
    persist: () => {},
  });
  expectIdentityError(
    () => link({ code: 'TG-legacy', payload: { id: '622' } }),
    'LINK_TOKEN_INVALID',
  );
  assert.equal(resolveCalls, 0, 'unbound legacy tokens must be rejected before identity resolution');
}

function testResolver(input: {
  owners?: Array<[TelegramAuthIdentityProvider, string, string]>;
  profiles?: Record<string, TestProfile>;
  lookups?: Array<[TelegramAuthIdentityProvider, string]>;
} = {}) {
  const owners = new Map(
    (input.owners ?? []).map(([provider, providerUserId, userId]) => [
      `${provider}:${providerUserId}`,
      userId,
    ]),
  );
  const lookups = input.lookups ?? [];
  return createTelegramAuthUserResolver<TestUser, TestProfile>({
    findIdentityOwnerId: (provider, providerUserId) => {
      lookups.push([provider, providerUserId]);
      return owners.get(`${provider}:${providerUserId}`);
    },
    findIdentityProviderIds: (userId, provider) => (
      [...owners]
        .filter(([providerKey, ownerId]) => ownerId === userId && providerKey.startsWith(`${provider}:`))
        .map(([providerKey]) => providerKey.slice(provider.length + 1))
    ),
    readVerifiedProfile: telegramId => input.profiles?.[telegramId] ?? null,
    verifiedEmail: profile => profile?.verified ? String(profile.email ?? '').trim().toLowerCase() : '',
    digest: value => createHash('sha256').update(value).digest('hex'),
    now: () => NOW,
    createUser: (candidate: TelegramAuthNewUser): TestUser => ({
      ...candidate,
      role: 'user',
    }),
  });
}

function expectIdentityError(
  work: () => unknown,
  code: TelegramAuthIdentityError['code'],
) {
  assert.throws(work, error => (
    error instanceof TelegramAuthIdentityError && error.code === code
  ));
}

{
  const resolve = testResolver();
  const store: TestStore = { users: [], sessions: [] };
  expectIdentityError(
    () => resolve({ store, payload: {} }),
    'IDENTITY_REQUIRED',
  );
  expectIdentityError(
    () => resolve({ store, payload: { id: '12abc34' } }),
    'INVALID_TELEGRAM_ID',
  );
  for (const id of [' 123', '+123', '1e3', '1.2', '0', '-1']) {
    expectIdentityError(
      () => resolve({ store, payload: { id } }),
      'INVALID_TELEGRAM_ID',
    );
  }
  expectIdentityError(
    () => resolve({ store, payload: { id: Number.MAX_SAFE_INTEGER + 1 } }),
    'INVALID_TELEGRAM_ID',
  );
  for (const oidcSub of [' padded-sub ', 'control\u0000sub', 'x'.repeat(256)]) {
    expectIdentityError(
      () => resolve({ store, payload: { oidc_sub: oidcSub } }),
      'INVALID_OIDC_SUB',
    );
  }
  assert.deepEqual(store, { users: [], sessions: [] });
}

{
  const victim = testUser('victim', {
    telegramId: '100',
    telegramUsername: 'reusable_name',
  });
  const originalVictim = structuredClone(victim);
  const store: TestStore = { users: [victim], sessions: [] };
  const lookups: Array<[TelegramAuthIdentityProvider, string]> = [];
  const resolve = testResolver({ lookups });
  const result = resolve({
    store,
    payload: {
      id: '200',
      oidc_sub: 'telegram-oidc-user-200',
      first_name: 'New',
      last_name: 'Owner',
      username: '@reusable_name',
      photo_url: 'https://t.me/i/userpic/new-owner.jpg',
    },
  });

  assert.notEqual(result.user.id, victim.id);
  assert.equal(result.user.telegramId, '200');
  assert.equal(result.user.telegramUsername, 'reusable_name');
  assert.equal(store.users.length, 2);
  assert.deepEqual(victim, originalVictim);
  assert.deepEqual(lookups, [
    ['telegram', '200'],
    ['telegram_oidc', 'telegram-oidc-user-200'],
  ]);
}

{
  const victim = testUser('victim', { telegramUsername: 'oidc_name' });
  const store: TestStore = { users: [victim], sessions: [] };
  const resolve = testResolver();
  const result = resolve({
    store,
    payload: { oidc_sub: 'fresh-subject', username: 'oidc_name' },
  });
  assert.notEqual(result.user.id, victim.id);
  assert.ok(result.claims.some(claim => (
    claim.provider === 'telegram_oidc' && claim.providerUserId === 'fresh-subject'
  )));
  assert.equal(store.users.length, 2);
}

{
  const uppercaseOwner = testUser('uppercase-owner');
  const store: TestStore = { users: [uppercaseOwner], sessions: [] };
  const resolve = testResolver({ owners: [
    ['telegram_oidc', 'Case-Sensitive-Subject', uppercaseOwner.id],
  ] });
  const result = resolve({ store, payload: { oidc_sub: 'case-sensitive-subject' } });
  assert.notEqual(result.user.id, uppercaseOwner.id);
  assert.equal(store.users.length, 2);
}

{
  const store: TestStore = { users: [], sessions: [] };
  const resolve = testResolver();
  const result = resolve({
    store,
    payload: {
      id: '250',
      username: 'safe_name',
      photo_url: 'javascript:alert(1)',
      email: 'victim@example.com',
    },
  });
  assert.equal(result.user.photoUrl, '');
  assert.equal(result.user.email, 'telegram_250@telegram.local');
}

{
  const owner = testUser('owner', {
    name: 'Telegram 300',
    telegramId: '300',
    telegramUsername: 'old_name',
    photoUrl: 'https://example.test/old.jpg',
  });
  const store: TestStore = {
    users: [owner],
    sessions: [{ userId: owner.id, email: owner.email }],
  };
  const resolve = testResolver({ owners: [['telegram', '300', owner.id]] });
  const result = resolve({
    store,
    payload: {
      id: '300',
      first_name: 'Current',
      last_name: 'Name',
      username: 'new_name',
      photo_url: 'https://example.test/new.jpg',
    },
  });

  assert.equal(result.user, owner);
  assert.equal(owner.name, 'Current Name');
  assert.equal(owner.telegramUsername, 'new_name');
  assert.equal(owner.photoUrl, 'https://example.test/new.jpg');
  assert.equal(owner.updatedAt, NOW);
}

{
  const telegramOwner = testUser('telegram-owner', { telegramId: '400' });
  const oidcOwner = testUser('oidc-owner');
  const store: TestStore = { users: [telegramOwner, oidcOwner], sessions: [] };
  const original = structuredClone(store);
  const resolve = testResolver({ owners: [
    ['telegram', '400', telegramOwner.id],
    ['telegram_oidc', 'sub-400', oidcOwner.id],
  ] });

  expectIdentityError(
    () => resolve({ store, payload: { id: '400', oidc_sub: 'sub-400', username: 'same' } }),
    'TELEGRAM_IDENTITY_CONFLICT',
  );
  assert.deepEqual(store, original);
}

{
  const telegramOwner = testUser('telegram-owner', {
    email: 'telegram-owner@example.com',
    telegramId: '500',
  });
  const emailOwner = testUser('email-owner', { email: 'member@example.com' });
  const store: TestStore = {
    users: [telegramOwner, emailOwner],
    sessions: [{ userId: telegramOwner.id, email: telegramOwner.email }],
  };
  const original = structuredClone(store);
  const resolve = testResolver({
    owners: [
      ['telegram', '500', telegramOwner.id],
      ['boosty-email', 'member@example.com', emailOwner.id],
    ],
    profiles: { '500': { email: 'MEMBER@example.com', verified: true } },
  });

  expectIdentityError(
    () => resolve({ store, payload: { id: '500', username: 'owner' } }),
    'BOOSTY_IDENTITY_CONFLICT',
  );
  assert.deepEqual(store, original);
}

{
  const syntheticOwner = testUser('synthetic-owner', {
    email: 'telegram_550@telegram.local',
    telegramId: 'different-id',
  });
  const store: TestStore = { users: [syntheticOwner], sessions: [] };
  const original = structuredClone(store);
  const resolve = testResolver();
  expectIdentityError(
    () => resolve({ store, payload: { id: '550' } }),
    'TELEGRAM_IDENTITY_CONFLICT',
  );
  assert.deepEqual(store, original);
}

{
  const owner = testUser('owner', { telegramId: '600' });
  const target = testUser('target');
  const store: TestStore = { users: [owner, target], sessions: [] };
  const original = structuredClone(store);
  const resolve = testResolver({ owners: [['telegram', '600', owner.id]] });

  expectIdentityError(
    () => resolve({ store, payload: { id: '600' }, linkUserId: target.id }),
    'TELEGRAM_IDENTITY_CONFLICT',
  );
  assert.deepEqual(store, original);
  expectIdentityError(
    () => resolve({ store, payload: { id: '601' }, linkUserId: 'missing-user' }),
    'LINK_TARGET_NOT_FOUND',
  );
}

{
  const target = testUser('target', {
    telegramId: '610',
    telegramUsername: 'existing_owner',
  });
  const store: TestStore = {
    users: [target],
    sessions: [{ userId: target.id, email: target.email }],
  };
  const original = structuredClone(store);
  const resolve = testResolver();

  expectIdentityError(
    () => resolve({ store, payload: { id: '611', username: 'replacement' }, linkUserId: target.id }),
    'TELEGRAM_IDENTITY_CONFLICT',
  );
  assert.deepEqual(store, original);
}

{
  const target = testUser('oidc-target');
  const store: TestStore = { users: [target], sessions: [] };
  const original = structuredClone(store);
  const resolve = testResolver({ owners: [
    ['telegram_oidc', 'existing-subject', target.id],
  ] });

  expectIdentityError(
    () => resolve({ store, payload: { oidc_sub: 'replacement-subject' }, linkUserId: target.id }),
    'TELEGRAM_IDENTITY_CONFLICT',
  );
  assert.deepEqual(store, original);
}

{
  const owner = testUser('owner', {
    email: 'old@example.com',
    telegramId: '700',
  });
  const store: TestStore = {
    users: [owner],
    sessions: [
      { userId: owner.id, email: 'old@example.com' },
      { email: 'old@example.com' },
    ],
  };
  const resolve = testResolver({
    owners: [
      ['telegram', '700', owner.id],
      ['telegram_oidc', 'sub-700', owner.id],
      ['boosty-email', 'verified@example.com', owner.id],
    ],
    profiles: { '700': { email: 'verified@example.com', verified: true } },
  });
  const result = resolve({
    store,
    payload: { id: '700', oidc_sub: 'sub-700', username: 'owner_renamed' },
  });

  assert.equal(result.user, owner);
  assert.equal(owner.email, 'verified@example.com');
  assert.deepEqual(store.sessions.map(session => session.email), [
    'verified@example.com',
    'verified@example.com',
  ]);
}

{
  const store: TestStore = { users: [], sessions: [] };
  const resolve = testResolver({ owners: [['telegram_oidc', 'orphan-sub', 'missing-user']] });
  expectIdentityError(
    () => resolve({ store, payload: { oidc_sub: 'orphan-sub' } }),
    'IDENTITY_OWNER_NOT_FOUND',
  );
  assert.equal(store.users.length, 0);
}

const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
const loginPanelSource = readFileSync(
  new URL('../src/modules/identity/ui/LoginPanel.tsx', import.meta.url),
  'utf8',
);
const telegramLinkActionsSource = readFileSync(
  new URL('../src/modules/identity/ui/TelegramAccountLinkActions.tsx', import.meta.url),
  'utf8',
);
assert.match(
  serverSource,
  /from '\.\/modules\/telegramAuth\/public\.js'/,
  'the server composition root must consume the Telegram auth public boundary',
);
assert.doesNotMatch(
  serverSource,
  /provider = 'telegram_oidc' AND lower\(username\)/,
  'OIDC display usernames must never select an account',
);
assert.doesNotMatch(
  serverSource,
  /telegramUsername \|\| ''\)\.toLowerCase\(\) === username\.toLowerCase\(\)/,
  'legacy Telegram display usernames must never select an account',
);
assert.doesNotMatch(
  serverSource,
  /function upsertTelegramUser\(/,
  'Telegram identity policy must live in the owned module',
);
const upsertUserRowSource = serverSource.slice(
  serverSource.indexOf('function upsertUserRow('),
  serverSource.indexOf('function authUserFromRow('),
);
assert.doesNotMatch(
  upsertUserRowSource,
  /provider\s*=\s*'telegram'|VALUES \(\?, 'telegram'/,
  'generic user persistence must not bypass the Telegram identity repository',
);
assert.match(
  serverSource,
  /if \(!telegramIdentity\?\.user_id && emailUser\?\.id\) \{[\s\S]{0,500}claimNumericTelegramIdentity/,
  'legacy KHA email matching must use the one-identity-per-user claim policy',
);
assert.doesNotMatch(
  serverSource,
  /resolveTelegramUser\(payload, \{ linkUserId: currentUser\?\.id \}\)/,
  'ordinary Telegram callbacks must not infer a link command from an ambient auth cookie',
);
assert.match(
  serverSource,
  /telegramLoginWidgetDataCheckString\(payload\)/,
  'legacy Telegram HMAC verification must exclude application-owned state fields',
);
assert.match(
  serverSource,
  /takeTelegramAuthIntent\(req, res,/,
  'legacy Telegram completion must consume a server-issued browser intent',
);
assert.equal(
  serverSource.match(/legacyTelegramIdentityPayload\(payload\)/g)?.length,
  2,
  'both legacy GET and POST must resolve only source-authenticated Telegram fields',
);
assert.match(
  serverSource,
  /const telegramPayload = telegramBotIdentityPayload\(telegramUser\)/,
  'the production webhook must strictly normalize the Telegram sender',
);
assert.match(
  serverSource,
  /telegramBotLinkService\(\{\s*code: linkCode,\s*payload: telegramPayload,?\s*\}\)/,
  'the production webhook must use the same immutable identity resolver as browser auth',
);
assert.match(
  serverSource,
  /app\.post\('\/api\/auth\/telegram\/link-start'/,
  'OIDC-only deployments need an authenticated explicit web-link start endpoint',
);
assert.match(
  serverSource,
  /linkUserId,\s*\}\);/,
  'the OIDC callback must preserve the explicit signed link target',
);
assert.doesNotMatch(
  loginPanelSource,
  /telegramLinkUrl|label="Привязать Telegram"/,
  'the profile must not advertise ambient-cookie web linking without a server-issued intent',
);
assert.match(
  loginPanelSource,
  /identityLabel = authUser\.telegramLinked/,
  'the profile link state must come from immutable server identity ownership',
);
assert.doesNotMatch(
  loginPanelSource,
  /identityLabel = authUser\.telegramUsername/,
  'mutable Telegram usernames must remain display-only metadata',
);
assert.match(
  telegramLinkActionsSource,
  /input\.mode === 'oidc'[\s\S]{0,500}input\.onOidcLink[\s\S]{0,500}Привязать Telegram/,
  'OIDC-only profiles must retain an explicit server-issued linking action',
);

console.log('Telegram immutable identity resolution tests passed');
