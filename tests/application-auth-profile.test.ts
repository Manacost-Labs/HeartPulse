import assert from 'node:assert/strict';
import {
  serializeApplicationProfileUser,
  serializeApplicationSubscription,
} from '../server/app/applicationAuthProfile.js';
import { accountTabFromHash } from '../src/modules/identity/model/accountTabs';

const internalUser = {
  id: 'user-1',
  publicProfileId: '7',
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
  publicProfileId: '7',
  profileUrl: 'https://arena.hs-manacost.ru/?login',
  email: 'player@example.test',
  name: 'Игрок',
  avatarInitials: 'ИИ',
});
// The account is the home document with `?login` (the origin nginx serves listed documents only and has
// no `/profile/`), whatever the configured site address looks like.
for (const appUrl of ['https://hearthpulse.net', 'https://hearthpulse.net/', 'https://hearthpulse.net//']) {
  const profile = new URL(serializeApplicationProfileUser(internalUser, appUrl).profileUrl);
  assert.equal(profile.origin, 'https://hearthpulse.net', appUrl);
  assert.equal(profile.pathname, '/', `${appUrl}: the home document`);
  assert.ok(profile.searchParams.has('login'), `${appUrl}: opens the account`);
  assert.equal(profile.hash, '', `${appUrl}: no anchor of its own, clients add theirs`);
}
assert.doesNotMatch(user.profileUrl, /\/profile\b/, 'the site has no /profile/ page');
// Connected apps add a section anchor to it; the query must survive and every anchor must be a known account section.
for (const anchor of ['account-replays', 'account-tracker-data', 'account-access', 'account-twitch']) {
  const link = new URL(user.profileUrl);
  link.hash = anchor;
  assert.equal(link.href, `https://arena.hs-manacost.ru/?login#${anchor}`);
  assert.ok(accountTabFromHash(link.hash), `the account opens a tab for #${anchor}`);
}
assert.equal(accountTabFromHash('#no-such-section'), null);
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
