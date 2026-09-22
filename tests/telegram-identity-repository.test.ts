import assert from 'node:assert/strict';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import {
  assertActiveTelegramLinkSession,
  claimTelegramAuthIdentities,
  consumeTelegramAuthIntentAndClaimIdentities,
  consumeTelegramLinkTokenAndClaimIdentities,
  ensureTelegramIdentityOwnershipConstraint,
  ensureTelegramLinkTokenSessionBinding,
  issueTelegramLinkToken,
  storeTelegramAuthIntent,
  TelegramAuthIdentityError,
  type TelegramAuthIdentityClaim,
} from '../server/modules/telegramAuth/public.js';
import {
  consumeTelegramAuthIntentNonce,
  consumeTelegramLinkToken,
} from '../server/modules/telegramAuth/repository.js';

const NOW = '2026-08-17T12:00:00.000Z';

function identityClaim(
  provider: TelegramAuthIdentityClaim['provider'],
  providerUserId: string,
): TelegramAuthIdentityClaim {
  return {
    provider,
    providerUserId,
    email: provider === 'boosty-email' ? providerUserId : '',
    username: 'display_only',
    photoUrl: 'https://example.test/avatar.jpg',
    verifiedAt: NOW,
  };
}

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      photo_url TEXT NOT NULL DEFAULT '',
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_user_id)
    );
    CREATE TABLE telegram_link_tokens (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      used_at TEXT,
      telegram_id TEXT
    );
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE telegram_auth_intents (
      nonce_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  ensureTelegramIdentityOwnershipConstraint(db);
  return db;
}

{
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      UNIQUE(provider, provider_user_id)
    );
    INSERT INTO users (id) VALUES ('duplicate-owner');
    INSERT INTO identities (user_id, provider, provider_user_id)
    VALUES
      ('duplicate-owner', 'telegram', '7101'),
      ('duplicate-owner', 'telegram', '7102'),
      ('missing-owner', 'telegram_oidc', 'orphan-subject');
  `);
  assert.throws(
    () => ensureTelegramIdentityOwnershipConstraint(db),
    /duplicate_groups=1, orphan_rows=1/,
    'legacy duplicate or orphan ownership must stop schema activation without exposing identity values',
  );
  assert.equal(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM pragma_index_list('identities')
      WHERE name = 'idx_identities_user_telegram_provider'
    `).get()?.count,
    0,
    'the constraint must not be activated on ambiguous legacy data',
  );
  db.close();
}

{
  const db = database();
  db.prepare(`
    INSERT INTO identities (
      user_id, provider, provider_user_id, email, username, photo_url,
      verified_at, created_at, updated_at
    ) VALUES ('concurrent-owner', 'telegram', '7201', '', '', '', ?, ?, ?)
  `).run(NOW, NOW, NOW);
  assert.throws(
    () => db.prepare(`
      INSERT INTO identities (
        user_id, provider, provider_user_id, email, username, photo_url,
        verified_at, created_at, updated_at
      ) VALUES ('concurrent-owner', 'telegram', '7202', '', '', '', ?, ?, ?)
    `).run(NOW, NOW, NOW),
    /UNIQUE constraint failed/,
    'the database must reject a concurrent second numeric Telegram identity',
  );
  assert.doesNotThrow(() => db.prepare(`
    INSERT INTO identities (
      user_id, provider, provider_user_id, email, username, photo_url,
      verified_at, created_at, updated_at
    ) VALUES ('concurrent-owner', 'telegram_oidc', 'oidc-7201', '', '', '', ?, ?, ?)
  `).run(NOW, NOW, NOW), 'one numeric identity and one OIDC subject are allowed for the same user');
  db.close();
}

{
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE telegram_link_tokens (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT,
      telegram_id TEXT
    );
    INSERT INTO telegram_link_tokens (code, user_id, expires_at, created_at)
    VALUES ('TG-old-token', 'legacy-user', 9999999999999, '${NOW}');
  `);
  ensureTelegramLinkTokenSessionBinding(db);
  const columns = db.prepare('PRAGMA table_info(telegram_link_tokens)').all()
    .map(row => String(row.name));
  assert.equal(columns.includes('session_token_hash'), true);
  assert.equal(
    db.prepare("SELECT session_token_hash FROM telegram_link_tokens WHERE code = 'TG-old-token'").get()
      ?.session_token_hash,
    '',
    'legacy bot link tokens must migrate to an unusable empty session binding',
  );
  assert.doesNotThrow(() => ensureTelegramLinkTokenSessionBinding(db), 'the migration must be idempotent');
  db.close();
}

{
  const db = database();
  const now = Date.parse(NOW);
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at)
    VALUES ('active-link-session', 'owner', 'owner@example.com', ?, ?)
  `).run(now + 60_000, NOW);
  assert.doesNotThrow(() => assertActiveTelegramLinkSession(db, {
    userId: 'owner',
    sessionTokenHash: 'active-link-session',
    now,
  }));
  db.prepare("DELETE FROM sessions WHERE token_hash = 'active-link-session'").run();
  assert.throws(
    () => assertActiveTelegramLinkSession(db, {
      userId: 'owner',
      sessionTokenHash: 'active-link-session',
      now,
    }),
    error => error instanceof TelegramAuthIdentityError
      && error.code === 'LINK_SESSION_INVALID',
    'final linking persistence must reject a session revoked during the provider round trip',
  );
  db.close();
}

{
  const db = database();
  const issued = issueTelegramLinkToken(db, {
    userId: 'session-owner',
    sessionTokenHash: 'session-hash',
    now: Date.parse(NOW),
    ttlMs: 15 * 60_000,
    randomCode: () => 'TG-Ab3_Ab3_Ab3_Ab3_Ab3_Ab3_',
  });
  assert.deepEqual(issued, {
    code: 'TG-Ab3_Ab3_Ab3_Ab3_Ab3_Ab3_',
    expiresAt: Date.parse(NOW) + 15 * 60_000,
  });
  const row = db.prepare(
    'SELECT user_id, session_token_hash FROM telegram_link_tokens WHERE code = ?',
  ).get(issued.code);
  assert.equal(row?.user_id, 'session-owner');
  assert.equal(row?.session_token_hash, 'session-hash');
  db.close();
}


{
  const db = database();
  storeTelegramAuthIntent(db, {
    nonceHash: 'browser-nonce-hash',
    expiresAt: Date.now() + 60_000,
    createdAt: NOW,
    now: Date.now(),
  });
  assert.equal(consumeTelegramAuthIntentNonce(db, {
    nonceHash: 'browser-nonce-hash',
    now: Date.now(),
  }), true);
  assert.equal(consumeTelegramAuthIntentNonce(db, {
    nonceHash: 'browser-nonce-hash',
    now: Date.now(),
  }), false, 'parallel/replayed callbacks must have exactly one database winner');
  db.close();
}

{
  const db = database();
  claimTelegramAuthIdentities(db, 'email-owner', [identityClaim('telegram', '710')]);
  assert.throws(
    () => claimTelegramAuthIdentities(db, 'email-owner', [identityClaim('telegram', '711')]),
    error => error instanceof TelegramAuthIdentityError
      && error.code === 'TELEGRAM_IDENTITY_CONFLICT',
    'legacy KHA/email sync must not attach a second numeric Telegram identity to one user',
  );
  assert.deepEqual(
    db.prepare("SELECT provider_user_id FROM identities WHERE user_id = 'email-owner' AND provider = 'telegram'")
      .all()
      .map(row => String(row.provider_user_id)),
    ['710'],
  );
  db.close();
}

{
  const db = database();
  storeTelegramAuthIntent(db, {
    nonceHash: 'rollback-nonce-hash',
    expiresAt: Date.now() + 60_000,
    createdAt: NOW,
    now: Date.now(),
  });
  db.prepare(`
    INSERT INTO identities (
      user_id, provider, provider_user_id, email, username, photo_url,
      verified_at, created_at, updated_at
    ) VALUES ('other-owner', 'telegram', '970', '', '', '', ?, ?, ?)
  `).run(NOW, NOW, NOW);

  db.exec('BEGIN IMMEDIATE');
  assert.throws(() => consumeTelegramAuthIntentAndClaimIdentities(db, {
    nonceHash: 'rollback-nonce-hash',
    now: Date.now(),
    userId: 'target',
    claims: [identityClaim('telegram', '970')],
  }), error => error instanceof TelegramAuthIdentityError
    && error.code === 'TELEGRAM_IDENTITY_CONFLICT');
  db.exec('ROLLBACK');
  assert.equal(consumeTelegramAuthIntentNonce(db, {
    nonceHash: 'rollback-nonce-hash',
    now: Date.now(),
  }), true, 'a failed identity transaction must not burn the browser intent');
  db.close();
}

{
  const db = database();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at)
    VALUES ('session-target', 'target', 'target@example.com', ?, ?)
  `).run(Date.now() + 60_000, NOW);
  db.prepare(`
    INSERT INTO telegram_link_tokens (code, user_id, session_token_hash, expires_at)
    VALUES ('TG-123456', 'target', 'session-target', ?)
  `).run(Date.now() + 60_000);

  assert.equal(consumeTelegramLinkToken(db, {
    code: 'TG-123456',
    userId: 'target',
    sessionTokenHash: '',
    telegramId: '898',
    usedAt: NOW,
    now: Date.now(),
  }), false, 'an unbound token must never be consumable');
  assert.equal(consumeTelegramLinkToken(db, {
    code: 'TG-123456',
    userId: 'target',
    sessionTokenHash: 'different-session',
    telegramId: '899',
    usedAt: NOW,
    now: Date.now(),
  }), false, 'the consumer must present the session hash stored with the token');
  assert.equal(consumeTelegramLinkToken(db, {
    code: 'TG-123456',
    userId: 'target',
    sessionTokenHash: 'session-target',
    telegramId: '900',
    usedAt: NOW,
    now: Date.now(),
  }), true);
  assert.equal(consumeTelegramLinkToken(db, {
    code: 'TG-123456',
    userId: 'target',
    sessionTokenHash: 'session-target',
    telegramId: '901',
    usedAt: NOW,
    now: Date.now(),
  }), false, 'a Telegram link token must have exactly one winner');

  const token = db.prepare(`
    SELECT used_at, telegram_id
    FROM telegram_link_tokens
    WHERE code = 'TG-123456'
  `).get();
  assert.equal(token?.used_at, NOW);
  assert.equal(token?.telegram_id, '900');
  db.close();
}

{
  const db = database();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at)
    VALUES ('session-rollback', 'target', 'target@example.com', ?, ?)
  `).run(Date.now() + 60_000, NOW);
  db.prepare(`
    INSERT INTO telegram_link_tokens (code, user_id, session_token_hash, expires_at)
    VALUES ('TG-654321', 'target', 'session-rollback', ?)
  `).run(Date.now() + 60_000);
  db.prepare(`
    INSERT INTO identities (
      user_id, provider, provider_user_id, email, username, photo_url,
      verified_at, created_at, updated_at
    ) VALUES ('other-owner', 'boosty-email', 'member@example.com', '', '', '', ?, ?, ?)
  `).run(NOW, NOW, NOW);

  db.exec('BEGIN IMMEDIATE');
  assert.throws(
    () => consumeTelegramLinkTokenAndClaimIdentities(db, {
      code: 'TG-654321',
      userId: 'target',
      sessionTokenHash: 'session-rollback',
      telegramId: '950',
      usedAt: NOW,
      now: Date.now(),
      claims: [
        identityClaim('telegram', '950'),
        identityClaim('boosty-email', 'member@example.com'),
      ],
    }),
    error => error instanceof TelegramAuthIdentityError
      && error.code === 'BOOSTY_IDENTITY_CONFLICT',
  );
  db.exec('ROLLBACK');

  assert.equal(
    db.prepare("SELECT used_at FROM telegram_link_tokens WHERE code = 'TG-654321'").get()?.used_at,
    null,
    'a claim conflict must leave the bot link token available after transaction rollback',
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM identities WHERE provider = 'telegram'").get()?.count,
    0,
  );
  db.close();
}

{
  const db = database();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at)
    VALUES ('revoked-session', 'target', 'target@example.com', ?, ?)
  `).run(Date.now() + 60_000, NOW);
  db.prepare(`
    INSERT INTO telegram_link_tokens (code, user_id, session_token_hash, expires_at)
    VALUES ('TG-revoked', 'target', 'revoked-session', ?)
  `).run(Date.now() + 60_000);
  db.prepare("DELETE FROM sessions WHERE token_hash = 'revoked-session'").run();

  assert.equal(consumeTelegramLinkToken(db, {
    code: 'TG-revoked',
    userId: 'target',
    sessionTokenHash: 'revoked-session',
    telegramId: '960',
    usedAt: NOW,
    now: Date.now(),
  }), false, 'a bot link token must stop working after its issuing session is revoked');
  assert.equal(
    db.prepare("SELECT used_at FROM telegram_link_tokens WHERE code = 'TG-revoked'").get()?.used_at,
    null,
  );
  db.close();
}

{
  const db = database();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at)
    VALUES ('expired-session', 'target', 'target@example.com', ?, ?)
  `).run(Date.now() - 1, NOW);
  db.prepare(`
    INSERT INTO telegram_link_tokens (code, user_id, session_token_hash, expires_at)
    VALUES ('TG-expired-session', 'target', 'expired-session', ?)
  `).run(Date.now() + 60_000);

  assert.equal(consumeTelegramLinkToken(db, {
    code: 'TG-expired-session',
    userId: 'target',
    sessionTokenHash: 'expired-session',
    telegramId: '961',
    usedAt: NOW,
    now: Date.now(),
  }), false, 'an unexpired link token must not outlive its issuing session');
  db.close();
}

{
  const db = database();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at)
    VALUES ('other-user-session', 'other-user', 'other@example.com', ?, ?)
  `).run(Date.now() + 60_000, NOW);
  db.prepare(`
    INSERT INTO telegram_link_tokens (code, user_id, session_token_hash, expires_at)
    VALUES ('TG-wrong-owner', 'target', 'other-user-session', ?)
  `).run(Date.now() + 60_000);

  assert.equal(consumeTelegramLinkToken(db, {
    code: 'TG-wrong-owner',
    userId: 'target',
    sessionTokenHash: 'other-user-session',
    telegramId: '962',
    usedAt: NOW,
    now: Date.now(),
  }), false, 'the issuing session must belong to the same user as the link token');
  db.close();
}

{
  const db = database();
  const claims = [
    identityClaim('telegram', '700'),
    identityClaim('telegram_oidc', 'sub-700'),
  ];
  db.exec('BEGIN IMMEDIATE');
  claimTelegramAuthIdentities(db, 'owner', claims);
  db.exec('COMMIT');
  claimTelegramAuthIdentities(db, 'owner', claims);

  const rows = db.prepare(`
    SELECT user_id, provider, provider_user_id
    FROM identities
    ORDER BY provider
  `).all().map(row => ({
    user_id: String(row.user_id),
    provider: String(row.provider),
    provider_user_id: String(row.provider_user_id),
  }));
  assert.deepEqual(rows, [
    { user_id: 'owner', provider: 'telegram', provider_user_id: '700' },
    { user_id: 'owner', provider: 'telegram_oidc', provider_user_id: 'sub-700' },
  ]);
  db.close();
}

{
  const db = database();
  db.prepare(`
    INSERT INTO identities (
      user_id, provider, provider_user_id, email, username, photo_url,
      verified_at, created_at, updated_at
    ) VALUES (?, 'telegram_oidc', ?, '', '', '', ?, ?, ?)
  `).run('other-owner', 'claimed-subject', NOW, NOW, NOW);

  db.exec('BEGIN IMMEDIATE');
  assert.throws(
    () => claimTelegramAuthIdentities(db, 'target', [
      identityClaim('telegram', '701'),
      identityClaim('telegram_oidc', 'claimed-subject'),
    ]),
    error => error instanceof TelegramAuthIdentityError
      && error.code === 'TELEGRAM_IDENTITY_CONFLICT',
  );
  db.exec('ROLLBACK');

  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM identities WHERE provider = 'telegram'").get()?.count,
    0,
    'a later claim conflict must roll back an earlier claim in the caller transaction',
  );
  db.close();
}

{
  const db = database();
  db.prepare(`
    INSERT INTO identities (
      user_id, provider, provider_user_id, email, username, photo_url,
      verified_at, created_at, updated_at
    ) VALUES (?, 'telegram', ?, '', '', '', ?, ?, ?)
  `).run('owner', '800', NOW, NOW, NOW);

  assert.throws(
    () => claimTelegramAuthIdentities(db, 'owner', [identityClaim('telegram', '801')]),
    error => error instanceof TelegramAuthIdentityError
      && error.code === 'TELEGRAM_IDENTITY_CONFLICT',
    'one user must not accumulate multiple Telegram identities',
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM identities WHERE user_id = 'owner' AND provider = 'telegram'").get()?.count,
    1,
  );
  db.close();
}

console.log('Telegram identity repository tests passed');
