import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountAccessSource,
  accountAccessTiles,
  accountLinkRows,
} from '../src/modules/identity/model/accountDashboard';
import type { AuthUser } from '../src/modules/identity/public';
import type { SubscriptionStatus } from '../src/modules/subscriptions/public';

function subscription(patch: Partial<SubscriptionStatus> = {}): SubscriptionStatus {
  return {
    hasAccess: false,
    source: 'none',
    checkedAt: null,
    stale: false,
    message: '',
    boosty: {},
    patreon: {},
    telegram: {},
    ...patch,
  };
}

function user(patch: Partial<AuthUser> = {}): AuthUser {
  return { id: 'user-1', email: 'maria@example.com', name: 'Мария', role: 'user', ...patch } as AuthUser;
}

test('access tiles follow the entitlement order and link to canonical section URLs', () => {
  const tiles = accountAccessTiles(subscription({
    hasAccess: true,
    entitlements: { arena: true, standard: true, battlegroundsArticles: false },
  }));
  assert.deepEqual(tiles.map(tile => tile.key), [
    'arena', 'battlegrounds', 'standard', 'contests', 'guidesArchive', 'arenaArticles', 'battlegroundsArticles',
  ]);
  assert.deepEqual(tiles.filter(tile => tile.unlocked).map(tile => tile.key), ['arena', 'standard']);
  for (const tile of tiles) assert.match(tile.href, /^\/[a-z-]+(?:\/[a-z-]+)*\/$/, `${tile.key} links to a canonical page`);
});

test('without an entitlement map every section follows the general access flag', () => {
  assert.equal(accountAccessTiles(subscription({ hasAccess: true })).every(tile => tile.unlocked), true);
  assert.equal(accountAccessTiles(subscription({ hasAccess: false })).some(tile => tile.unlocked), false);
  assert.equal(accountAccessTiles(null).some(tile => tile.unlocked), false);
});

test('an explicit empty entitlement map unlocks nothing even with general access', () => {
  assert.equal(accountAccessTiles(subscription({ hasAccess: true, entitlements: {} })).some(tile => tile.unlocked), false);
});

test('the access source names the provider that grants access', () => {
  assert.equal(accountAccessSource(subscription({
    hasAccess: true, boosty: { hasAccess: true, levelName: 'Алмаз', price: 300 },
  })), 'Boosty · Алмаз · 300 ₽');
  assert.equal(accountAccessSource(subscription({ hasAccess: true, boosty: { hasAccess: true } })), 'Boosty');
  assert.equal(accountAccessSource(subscription({
    hasAccess: true, patreon: { hasAccess: true, tierTitles: ['Gold', 'Patron'] },
  })), 'Patreon · Gold · Patron');
  assert.equal(accountAccessSource(subscription({ hasAccess: true, telegram: { hasAccess: true } })), 'Telegram VIP-канал');
  assert.equal(accountAccessSource(subscription({ hasAccess: true, source: 'admin' })), '');
  assert.equal(accountAccessSource(null), '');
});

test('link rows report every known way into the account', () => {
  const rows = accountLinkRows(user({ telegramLinked: true, telegramUsername: 'maria_hs' }), subscription({
    hasAccess: true,
    boosty: { hasAccess: true, email: 'boosty@example.com' },
    patreon: { configured: true, connected: false },
  }));
  assert.deepEqual(rows.map(row => [row.id, row.linked]), [
    ['email', true], ['telegram', true], ['boosty', true], ['patreon', false],
  ]);
  assert.equal(rows.find(row => row.id === 'telegram')?.detail, '@maria_hs');
  assert.equal(rows.find(row => row.id === 'boosty')?.detail, 'boosty@example.com · подписка активна');
});

test('a Telegram-only account has no real email and Patreon is hidden when it is not configured', () => {
  const rows = accountLinkRows(user({ email: '123@telegram.local', telegramLinked: true }), subscription());
  assert.equal(rows.find(row => row.id === 'email')?.linked, false);
  assert.equal(rows.some(row => row.id === 'patreon'), false);
});

test('a Telegram username without a server-side link does not count as linked', () => {
  const rows = accountLinkRows(user({ telegramLinked: false, telegramUsername: 'maria_hs', contactTelegram: 'maria_hs' }), subscription());
  const telegram = rows.find(row => row.id === 'telegram');
  assert.equal(telegram?.linked, false);
  assert.equal(telegram?.detail, 'Не привязан');
});
