import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createSessionBindings } from '../server/modules/browserIdentity/sessionBindings.js';

test('reader grants follow the exact canonical parent session, never email or another session', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, blocked_at TEXT);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
    INSERT INTO users VALUES ('u1', 'Читатель', NULL), ('u2', 'Читатель', NULL);
    INSERT INTO sessions VALUES ('parent', 'u1', 10000), ('other', 'u1', 10000);`);
  const bindings = createSessionBindings(db, Buffer.alloc(32, 42), () => 1000);
  bindings.bind('grant', 'u1', 'parent');
  assert.deepEqual(bindings.resolve('u1', 'grant'), { subject: 'u1', displayName: 'Читатель' });
  assert.equal(bindings.resolve('u2', 'grant'), undefined);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run('parent');
  assert.equal(bindings.resolve('u1', 'grant'), undefined);
  assert.throws(() => bindings.bind('another', 'u1', 'parent'));
  db.close();
});

test('block, expiry, deletion and binding tampering all fail closed', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, blocked_at TEXT);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
    INSERT INTO users VALUES ('u1', 'Имя', NULL);
    INSERT INTO sessions VALUES ('parent', 'u1', 10000);`);
  let now = 1000;
  const bindings = createSessionBindings(db, Buffer.alloc(32, 42), () => now);
  bindings.bind('grant', 'u1', 'parent');
  db.exec("UPDATE users SET blocked_at = 'blocked'");
  assert.equal(bindings.resolve('u1', 'grant'), undefined);
  db.exec('UPDATE users SET blocked_at = NULL');
  now = 10000;
  assert.equal(bindings.resolve('u1', 'grant'), undefined);
  now = 1000;
  db.exec("UPDATE browser_identity_session_bindings SET payload = 'corrupt'");
  assert.equal(bindings.resolve('u1', 'grant'), undefined);
  assert.equal(bindings.resolve('u1', undefined), undefined);
  db.close();
});

test('remembered reader binding is capped at an absolute 30 days and still follows parent revocation', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, blocked_at TEXT);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
    INSERT INTO users VALUES ('u1', 'Имя', NULL);
    INSERT INTO sessions VALUES ('parent', 'u1', 4000000000);`);
  let now = 1_000;
  const bindings = createSessionBindings(db, Buffer.alloc(32, 42), () => now);
  bindings.bind('remembered', 'u1', 'parent', 31 * 24 * 60 * 60 * 1000);
  now += 30 * 24 * 60 * 60 * 1000;
  assert.equal(bindings.resolve('u1', 'remembered'), undefined, 'the cap is an absolute deadline');
  now = 1_000;
  bindings.bind('revoked', 'u1', 'parent', 30 * 24 * 60 * 60 * 1000);
  db.exec('DELETE FROM sessions WHERE token_hash = \'parent\'');
  assert.equal(bindings.resolve('u1', 'revoked'), undefined);
  db.close();
});
