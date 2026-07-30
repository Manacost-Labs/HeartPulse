import assert from 'node:assert/strict';
import {
  serializeApplicationProfileUser,
  serializeApplicationSubscription,
} from '../server/app/applicationAuthProfile.js';

const internalUser = {
  id: 'user-1',
  publicProfileId: 'player-7',
  email: 'player@example.test',
  name: 'Игрок',
  avatarInitials: 'ИИ',
  role: 'admin',
  passwordHash: 'must-not-leak',
  telegramId: 'must-not-leak',
};
const user = serializeApplicationProfileUser(internalUser, 'https://arena.hs-manacost.ru/');

assert.deepEqual(user, {
  id: 'user-1',
  publicProfileId: 'player-7',
  profileUrl: 'https://arena.hs-manacost.ru/profiles/player-7',
  email: 'player@example.test',
  name: 'Игрок',
  avatarInitials: 'ИИ',
});
assert.equal('role' in user, false);
assert.equal('passwordHash' in user, false);
assert.equal('telegramId' in user, false);

const internalSubscription = {
  hasAccess: true,
  source: 'boosty',
  checkedAt: '2026-07-29T12:00:00.000Z',
  stale: false,
  entitlements: { standard: true, arena: false },
  boosty: { externalId: 'must-not-leak' },
  telegram: { username: 'must-not-leak' },
  message: 'internal provider message',
};
const subscription = serializeApplicationSubscription(internalSubscription);

assert.deepEqual(subscription, {
  hasAccess: true,
  source: 'boosty',
  checkedAt: '2026-07-29T12:00:00.000Z',
  stale: false,
  entitlements: { standard: true, arena: false },
});
assert.equal('boosty' in subscription, false);
assert.equal('telegram' in subscription, false);
assert.equal('message' in subscription, false);

console.log('application auth profile serializer tests passed');
