import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import express from 'express';
import {
  createPublicProfileRouter,
  type PublicProfileRecord,
} from '../server/modules/publicProfile/public.js';

const publicProfileModule = JSON.parse(readFileSync(
  new URL('../config/module-boundaries.json', import.meta.url),
  'utf8',
)) as {
  modules: Array<{
    id: string;
    root: string;
    publicEntry: string;
    focusedTests: string[];
  }>;
};
const publicProfileBoundary = publicProfileModule.modules.find(({ id }) => id === 'server.publicProfile');
assert.ok(publicProfileBoundary, 'server.publicProfile must be registered in the module inventory');
assert.deepEqual({
  root: publicProfileBoundary.root,
  publicEntry: publicProfileBoundary.publicEntry,
  focusedTests: publicProfileBoundary.focusedTests,
}, {
  root: 'server/modules/publicProfile',
  publicEntry: 'server/modules/publicProfile/public.ts',
  focusedTests: ['npm run test:public-profiles'],
});

for (const retiredPath of [
  '../server/publicProfileIdentity.ts',
  '../server/publicProfileRoutes.ts',
]) {
  assert.equal(existsSync(new URL(retiredPath, import.meta.url)), false,
    `${retiredPath} must not remain as a second source owner`);
}

const serverCompositionRoot = readFileSync(
  new URL('../server/index.ts', import.meta.url),
  'utf8',
);
assert.match(serverCompositionRoot, /from '\.\/modules\/publicProfile\/public\.js';/,
  'the server composition root must enter the profile module through public.ts');
assert.doesNotMatch(serverCompositionRoot, /publicProfileIdentity|publicProfileRoutes/,
  'the server composition root must not retain legacy profile owners');
assert.match(
  serverCompositionRoot,
  /findProfile:\s*createSqlitePublicProfileFinder\(db\)/,
  'the composition root must delegate public-profile persistence to the module repository',
);

const publicProfileId = '1';
const legacyPublicProfileId = 'p_AbCdEfGhIjKlMnOpQrStUv';
const publicCacheControl = 'public, max-age=60, stale-while-revalidate=300';
const profile: PublicProfileRecord = {
  publicProfileId,
  name: 'Игрок Манакоста',
  avatarInitials: 'ИМ',
  createdAt: '2026-07-28T00:00:00.000Z',
};
const privateSource = {
  ...profile,
  id: 'user_internal_secret',
  email: 'private@example.com',
  role: 'admin',
  country: 'Россия',
  contactTelegram: 'private_contact',
  subscription: { hasAccess: true },
};

let blocked = false;
let lookupFails = false;
let lookupCount = 0;
const app = express();
app.use('/api', createPublicProfileRouter({
  findProfile: id => {
    lookupCount += 1;
    if (lookupFails) throw new Error('private database failure');
    return (id === publicProfileId || id === legacyPublicProfileId) && !blocked
      ? privateSource
      : null;
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/profiles`;

try {
  const response = await fetch(`${baseUrl}/${publicProfileId}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), publicCacheControl);
  const body = await response.json() as { profile: Record<string, unknown> };
  assert.deepEqual(body, { profile });
  for (const privateField of [
    'id',
    'email',
    'role',
    'country',
    'contactTelegram',
    'subscription',
    'blockedAt',
  ]) {
    assert.equal(privateField in body.profile, false, `${privateField} must not be public`);
  }

  const legacy = await fetch(`${baseUrl}/${legacyPublicProfileId}`);
  assert.equal(legacy.status, 200);
  assert.deepEqual(await legacy.json(), { profile },
    'legacy opaque IDs may resolve but must only return the new numeric public identity');

  privateSource.name = `\u0000 ${'A'.repeat(130)} `;
  privateSource.avatarInitials = '\u0007';
  privateSource.createdAt = `\u0000${'x'.repeat(50)}`;
  const sanitized = await fetch(`${baseUrl}/${publicProfileId}`);
  assert.equal(sanitized.status, 200);
  assert.deepEqual(await sanitized.json(), {
    profile: {
      publicProfileId,
      name: 'A'.repeat(120),
      avatarInitials: 'AA',
      createdAt: 'x'.repeat(40),
    },
  });
  Object.assign(privateSource, profile);

  const previousLookupCount = lookupCount;
  const malformed = await fetch(`${baseUrl}/..%2Fadmin`);
  assert.equal(malformed.status, 404);
  assert.deepEqual(await malformed.json(), { error: 'Профиль не найден' });
  assert.equal(lookupCount, previousLookupCount,
    'encoded traversal-like input must be rejected before persistence');

  for (const invalidId of ['0', '01', '2147483648', 'user_internal_secret']) {
    const previousLookupCount = lookupCount;
    const invalid = await fetch(`${baseUrl}/${invalidId}`);
    assert.equal(invalid.status, 404, `${invalidId} must not be accepted as a public ID`);
    assert.deepEqual(await invalid.json(), { error: 'Профиль не найден' });
    assert.equal(lookupCount, previousLookupCount,
      `${invalidId} must be rejected before reaching persistence`);
  }

  const missing = await fetch(`${baseUrl}/7`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), publicCacheControl);
  assert.deepEqual(await missing.json(), { error: 'Профиль не найден' });

  blocked = true;
  const hidden = await fetch(`${baseUrl}/${publicProfileId}`);
  assert.equal(hidden.status, 404);
  assert.deepEqual(await hidden.json(), { error: 'Профиль не найден' });
  const hiddenLegacy = await fetch(`${baseUrl}/${legacyPublicProfileId}`);
  assert.equal(hiddenLegacy.status, 404);
  assert.deepEqual(await hiddenLegacy.json(), { error: 'Профиль не найден' });

  blocked = false;
  lookupFails = true;
  const unavailable = await fetch(`${baseUrl}/${publicProfileId}`);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), publicCacheControl);
  assert.deepEqual(await unavailable.json(), { error: 'Профиль временно недоступен' });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('public profile route security contracts passed');
