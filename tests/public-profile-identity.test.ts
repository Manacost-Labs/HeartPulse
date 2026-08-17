import assert from 'node:assert/strict';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import {
  createSqlitePublicProfileFinder,
  ensurePublicProfileIds,
  isLegacyPublicProfileId,
  isPublicProfileId,
  isPublicProfileLookupId,
  resolveUserPublicProfileId,
} from '../server/modules/publicProfile/public.js';

assert.equal(isPublicProfileId('1'), true);
assert.equal(isPublicProfileId('2147483647'), true);
assert.equal(isPublicProfileId('0'), false);
assert.equal(isPublicProfileId('01'), false);
assert.equal(isPublicProfileId('2147483648'), false);
assert.equal(isPublicProfileId('user_42368c85b8de'), false,
  'an internal account ID must never be accepted as a public profile ID');
assert.equal(isLegacyPublicProfileId('p_AbCdEfGhIjKlMnOpQrStUv'), true);
assert.equal(isPublicProfileLookupId('p_AbCdEfGhIjKlMnOpQrStUv'), true,
  'old shared links remain valid lookup keys during migration');
assert.equal(isPublicProfileLookupId('p_../../admin'), false);

const database = new DatabaseSync(':memory:');
database.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    public_profile_id TEXT,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_initials TEXT,
    created_at TEXT,
    blocked_at TEXT
  );
  INSERT INTO users (id, public_profile_id, email, name) VALUES
    ('member-first', 'p_AbCdEfGhIjKlMnOpQrStUv', 'one@example.com', 'One'),
    ('site-owner', 'p_ZyXwVuTsRqPoNmLkJiHgFe', 'owner@example.com', 'Owner'),
    ('member-third', NULL, 'three@example.com', 'Three');
`);

ensurePublicProfileIds(database, { preferredUserIds: ['site-owner'] });
const firstPass = database.prepare(
  'SELECT id, public_profile_id, public_numeric_id FROM users ORDER BY rowid',
).all() as Array<{ id: string; public_profile_id: string | null; public_numeric_id: number }>;

assert.deepEqual(firstPass.map(row => [row.id, row.public_numeric_id]), [
  ['member-first', 2],
  ['site-owner', 1],
  ['member-third', 3],
]);
assert.equal(firstPass[0].public_profile_id, 'p_AbCdEfGhIjKlMnOpQrStUv',
  'the old opaque ID must remain available for compatibility redirects/lookups');

ensurePublicProfileIds(database, { preferredUserIds: ['member-third'] });
const secondPass = database.prepare(
  'SELECT id, public_numeric_id FROM users ORDER BY rowid',
).all() as Array<{ id: string; public_numeric_id: number }>;
assert.deepEqual(
  secondPass.map(row => [row.id, row.public_numeric_id]),
  firstPass.map(row => [row.id, row.public_numeric_id]),
  'existing numeric assignments must remain immutable');

const preserved = resolveUserPublicProfileId(database, {
  id: 'site-owner',
  publicProfileId: 'p_ZyXwVuTsRqPoNmLkJiHgFe',
});
assert.equal(preserved, '1',
  'saving an older in-memory user shape must preserve its stored numeric public ID');

database.prepare(`
  UPDATE users
  SET avatar_initials = ?, created_at = ?
  WHERE id = ?
`).run('ОВ', '2026-07-28T00:00:00.000Z', 'site-owner');
const findPublicProfile = createSqlitePublicProfileFinder(() => database);
assert.deepEqual({ ...findPublicProfile('1') }, {
  publicProfileId: '1',
  name: 'Owner',
  avatarInitials: 'ОВ',
  createdAt: '2026-07-28T00:00:00.000Z',
});
assert.deepEqual(
  findPublicProfile('p_ZyXwVuTsRqPoNmLkJiHgFe'),
  findPublicProfile('1'),
  'a legacy lookup must resolve to the canonical numeric public identity',
);
database.prepare('UPDATE users SET blocked_at = ? WHERE id = ?')
  .run('2026-08-17T00:00:00.000Z', 'site-owner');
assert.equal(findPublicProfile('1'), null,
  'blocked accounts must remain hidden at the repository boundary');
assert.equal(findPublicProfile('p_ZyXwVuTsRqPoNmLkJiHgFe'), null,
  'legacy lookup aliases must not reveal blocked accounts');

assert.throws(
  () => database.prepare(
    'UPDATE users SET public_numeric_id = ? WHERE id = ?',
  ).run(1, 'member-first'),
  /UNIQUE/i,
);

database.close();

const rollbackDatabase = new DatabaseSync(':memory:');
rollbackDatabase.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    public_numeric_id INTEGER
  );
  INSERT INTO users (id) VALUES ('first'), ('second');
  CREATE TRIGGER reject_second_public_id
  BEFORE UPDATE OF public_numeric_id ON users
  WHEN NEW.id = 'second'
  BEGIN
    SELECT RAISE(ABORT, 'injected migration failure');
  END;
`);
assert.throws(
  () => ensurePublicProfileIds(rollbackDatabase),
  /injected migration failure/,
);
assert.deepEqual(
  rollbackDatabase.prepare('SELECT public_numeric_id FROM users ORDER BY rowid').all()
    .map(row => row.public_numeric_id),
  [null, null],
  'a failed backfill must not leave a partial public-ID assignment',
);
rollbackDatabase.exec('DROP TRIGGER reject_second_public_id');
ensurePublicProfileIds(rollbackDatabase);
assert.deepEqual(
  rollbackDatabase.prepare('SELECT public_numeric_id FROM users ORDER BY rowid').all()
    .map(row => row.public_numeric_id),
  [1, 2],
  'the idempotent migration must succeed after the transient failure is removed',
);
rollbackDatabase.close();
console.log('numeric public profile identity migration contracts passed');
