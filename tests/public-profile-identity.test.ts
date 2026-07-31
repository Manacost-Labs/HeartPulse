import assert from 'node:assert/strict';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import {
  ensurePublicProfileIds,
  isLegacyPublicProfileId,
  isPublicProfileId,
  isPublicProfileLookupId,
  resolveUserPublicProfileId,
} from '../server/publicProfileIdentity.js';

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
    name TEXT NOT NULL
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

assert.throws(
  () => database.prepare(
    'UPDATE users SET public_numeric_id = ? WHERE id = ?',
  ).run(1, 'member-first'),
  /UNIQUE/i,
);

database.close();
console.log('numeric public profile identity migration contracts passed');
