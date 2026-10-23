import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  PUBLIC_PROFILE_FIELDS,
  nicknameLookupKey,
  serializePublicProfile,
  validateNickname,
} from '../server/modules/publicProfile/public.js';
import { RESERVED_NICKNAMES } from '../server/modules/publicProfile/nickname.js';

function accepted(raw: string) {
  const result = validateNickname(raw);
  assert.equal(result.ok, true, `${raw} should be accepted`);
  return result as { ok: true; display: string; key: string };
}

function rejectedFor(raw: unknown) {
  const result = validateNickname(raw);
  assert.equal(result.ok, false, `${String(raw)} should be rejected`);
  return (result as { reason: string }).reason;
}

// Length, alphabet and allowed punctuation.
assert.equal(accepted('Vasya_Pro-1').display, 'Vasya_Pro-1');
assert.equal(accepted('  Арена  ').display, 'Арена', 'surrounding spaces are trimmed');
assert.equal(accepted('abc').display, 'abc');
assert.equal(accepted('a'.repeat(24)).display.length, 24);
assert.equal(rejectedFor('ab'), 'length');
assert.equal(rejectedFor('a'.repeat(25)), 'length');
assert.equal(rejectedFor(42), 'length');
assert.equal(rejectedFor(undefined), 'length');
for (const raw of ['vasya pro', 'vasya.pro', 'vásya', '<script>', 'a/b/c', 'ник!', 'abc​def', 'ab\ncd', '日本語の名前']) {
  assert.equal(rejectedFor(raw), 'characters', raw);
}
assert.equal(rejectedFor('12345'), 'needs-letter');
assert.equal(rejectedFor('___'), 'needs-letter');

// NFKC folds compatibility forms before any rule: full-width Latin is plain Latin.
assert.equal(accepted('ｐｌａｙｅｒ').display, 'player');
assert.equal(rejectedFor('ａｄｍｉｎ'), 'reserved');

// One alphabet per nickname: a Cyrillic «а» inside a Latin word is refused.
assert.equal(rejectedFor('pаypal'), 'mixed-script');
assert.equal(rejectedFor('Vasyа'), 'mixed-script');

// Case-insensitive and look-alike-insensitive keys.
assert.equal(accepted('Player').key, accepted('pLaYeR').key);
assert.equal(accepted('асе').key, accepted('ace').key, 'Cyrillic «асе» and Latin «ace» look the same');
assert.equal(accepted('c00l').key, accepted('cool').key);
assert.equal(accepted('Mila').key, accepted('M1la').key);
assert.equal(accepted('pro-gamer').key, accepted('pro_gamer').key);
assert.equal(accepted('ьоь').key, accepted('bob').key, 'Cyrillic «ь» reads as Latin «b»');
assert.equal(accepted('шиш').key, accepted('wuw').key);
assert.notEqual(accepted('player1').key, accepted('player2').key);

// Reserved words, route segments and impersonation fragments.
for (const raw of ['admin', 'Admin', 'ADM1N', 'root', 'null', 'support', 'login', 'api', 'tierlist', 'heroes', 'profile']) {
  assert.equal(rejectedFor(raw), 'reserved', raw);
}
for (const raw of ['hearthpulse_team', 'ManacostFan', 'real-admin', 'Админ_Вася', 'модератор_1', 'official-news',
  'Hearth_Pulse', 'Mana-Cost', 'Ad_min', 'Moder-ator', 'r_o_o_t', 'Deck_Builder']) {
  assert.equal(rejectedFor(raw), 'reserved', raw);
}

// Every top-level site route and app segment must be reserved, so `/u/` names
// never read as a section of the site.
const reserved = new Set(RESERVED_NICKNAMES);
const inventory = JSON.parse(readFileSync(new URL('../src/shared/seo/publicRouteInventory.json', import.meta.url), 'utf8')) as {
  routes: Array<{ pattern: string }>;
};
const appSegments = readdirSync(new URL('../apps/public-web/app/', import.meta.url), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);
const topLevelSegments = new Set([
  ...inventory.routes.map(route => route.pattern.split('/')[1] ?? ''),
  ...appSegments,
].filter(segment => segment && !segment.startsWith(':') && !segment.startsWith('[')));
for (const segment of topLevelSegments) {
  assert.ok(reserved.has(segment), `route segment /${segment}/ must be a reserved nickname`);
}

// The content hook (profanity filter) can refuse a nickname; lookups ignore it.
const refusing = validateNickname('badword', key => key !== 'badword');
assert.equal(refusing.ok === false ? refusing.reason : null, 'content');
assert.equal(nicknameLookupKey('badword'), 'badword');
assert.equal(nicknameLookupKey('Vasya'), accepted('vasya').key);
assert.equal(nicknameLookupKey('../etc'), null);
assert.equal(nicknameLookupKey('admin'), 'admln', 'lookups skip the reserved rule');

// The projection is an explicit allow-list: nothing else leaves the server.
const secretRow = {
  publicNumericId: 7,
  nickname: 'Vasya',
  createdAt: '2026-03-14T09:26:53.000Z',
  hasSubscription: 1,
  id: 'user_42368c85b8de',
  email: 'vasya@example.com',
  contact_email: 'contact@example.com',
  name: 'vasya.discord',
  role: 'admin',
  telegram_username: 'vasya_tg',
  telegram_id: '123456789',
  boosty_json: '{"price":300,"levelName":"Мастер арены"}',
  source: 'boosty',
  password_hash: 'hash',
  blocked_at: '',
  newsletter_opt_in: 1,
  ip: '203.0.113.7',
  session: 'session-token',
};
const projected = serializePublicProfile(secretRow);
assert.ok(projected);
assert.deepEqual(Object.keys(projected).sort(), [...PUBLIC_PROFILE_FIELDS].sort(),
  'the public profile must contain exactly the allow-listed fields');
assert.deepEqual(projected, {
  publicProfileId: '7',
  nickname: 'Vasya',
  displayName: 'Vasya',
  avatarInitials: 'VA',
  memberSince: '2026-03',
  isSubscriber: true,
});
const wire = JSON.stringify(projected);
for (const secret of ['user_42368c85b8de', 'example.com', 'vasya.discord', 'admin', 'vasya_tg', '123456789',
  'boosty', '300', 'Мастер', 'hash', '203.0.113.7', 'session-token', '09:26']) {
  assert.equal(wire.includes(secret), false, `public profile leaked ${secret}`);
}

// Without a nickname the page shows a neutral label, never the account name.
assert.deepEqual(serializePublicProfile({ ...secretRow, nickname: null, hasSubscription: 0 }), {
  publicProfileId: '7',
  nickname: null,
  displayName: 'Игрок #7',
  avatarInitials: '#',
  memberSince: '2026-03',
  isSubscriber: false,
});
assert.equal(serializePublicProfile({ ...secretRow, publicNumericId: null }), null);
assert.equal(serializePublicProfile({ ...secretRow, publicNumericId: '0' }), null);

console.log('public profile nickname and projection tests passed');
