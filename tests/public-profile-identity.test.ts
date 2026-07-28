import assert from 'node:assert/strict';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import {
  createPublicProfileId,
  ensurePublicProfileIds,
  isPublicProfileId,
  resolveUserPublicProfileId,
} from '../server/publicProfileIdentity.js';

const generated = createPublicProfileId();
assert.equal(isPublicProfileId(generated), true);
assert.equal(isPublicProfileId('user_42368c85b8de'), false,
  'an internal account ID must never be accepted as a public profile ID');
assert.equal(isPublicProfileId('p_short'), false);
assert.equal(isPublicProfileId('p_../../admin'), false);

const database = new DatabaseSync(':memory:');
database.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL
  );
  INSERT INTO users (id, email, name) VALUES
    ('internal-1', 'one@example.com', 'One'),
    ('internal-2', 'two@example.com', 'Two');
`);

let counter = 0;
ensurePublicProfileIds(database, () => `p_${String(++counter).padStart(22, 'A')}`);
const firstPass = database.prepare(
  'SELECT id, public_profile_id FROM users ORDER BY id',
).all() as Array<{ id: string; public_profile_id: string }>;

assert.equal(firstPass.length, 2);
assert.notEqual(firstPass[0].public_profile_id, firstPass[1].public_profile_id);
assert.ok(firstPass.every(row => isPublicProfileId(row.public_profile_id)));

ensurePublicProfileIds(database, () => {
  throw new Error('idempotent migration must not regenerate existing IDs');
});
const secondPass = database.prepare(
  'SELECT id, public_profile_id FROM users ORDER BY id',
).all() as Array<{ id: string; public_profile_id: string }>;
assert.deepEqual(secondPass, firstPass);

const preserved = resolveUserPublicProfileId(database, {
  id: 'internal-1',
  publicProfileId: '',
});
assert.equal(preserved, firstPass[0].public_profile_id,
  'saving an older in-memory user shape must preserve its stored public ID');

assert.throws(
  () => database.prepare(
    'UPDATE users SET public_profile_id = ? WHERE id = ?',
  ).run(firstPass[0].public_profile_id, 'internal-2'),
  /UNIQUE/i,
);

database.close();
console.log('public profile identity migration contracts passed');
