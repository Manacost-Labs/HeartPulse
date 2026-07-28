import assert from 'node:assert/strict';
import express from 'express';
import {
  createPublicProfileRouter,
  type PublicProfileRecord,
} from '../server/publicProfileRoutes.js';

const publicProfileId = 'p_AbCdEfGhIjKlMnOpQrStUv';
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
const app = express();
app.use('/api', createPublicProfileRouter({
  findProfile: id => id === publicProfileId && !blocked ? privateSource : null,
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
  assert.match(response.headers.get('cache-control') ?? '', /^public,/);
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

  const malformed = await fetch(`${baseUrl}/..%2Fadmin`);
  assert.equal(malformed.status, 404);
  assert.deepEqual(await malformed.json(), { error: 'Профиль не найден' });

  blocked = true;
  const hidden = await fetch(`${baseUrl}/${publicProfileId}`);
  assert.equal(hidden.status, 404);
  assert.deepEqual(await hidden.json(), { error: 'Профиль не найден' });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('public profile route security contracts passed');
