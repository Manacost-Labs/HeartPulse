import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountAccessNote,
  accountAccessSource,
  accountAccessTiles,
  accountLinkRows,
  hasTelegramLinkActions,
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

test('a linked Telegram row never shows the user-typed contact handle', () => {
  const rows = accountLinkRows(user({ telegramLinked: true, telegramUsername: '', contactTelegram: 'someone_else' }), subscription());
  assert.equal(rows.find(row => row.id === 'telegram')?.detail, 'Привязан');
});

test('before the first successful check the Boosty row makes no claim', () => {
  const boosty = accountLinkRows(user(), null).find(row => row.id === 'boosty');
  assert.equal(boosty?.linked, false);
  assert.equal(boosty?.detail, 'Статус появится после проверки');
});

test('grace periods and administrator grants explain themselves; a plain confirmation does not', () => {
  assert.equal(accountAccessNote(subscription({
    hasAccess: true, stale: true, boosty: { hasAccess: true, grace: true },
    message: 'Boosty временно недоступен, доступ сохранён на 24 часа.',
  })), 'Boosty временно недоступен, доступ сохранён на 24 часа.');
  assert.equal(accountAccessNote(subscription({
    hasAccess: true, stale: true, source: 'boosty', message: 'Подписка Манакоста подтверждена.',
  })), '', 'a stale provider elsewhere is not a grace period');
  assert.equal(accountAccessNote(subscription({
    hasAccess: true, source: 'manual-access', message: 'Бессрочный доступ выдан администратором.',
  })), 'Бессрочный доступ выдан администратором.');
  assert.equal(accountAccessNote(subscription({ hasAccess: true, source: 'boosty', message: 'Подписка Манакоста подтверждена.' })), '');
  assert.equal(accountAccessNote(subscription({ hasAccess: false, stale: true, message: 'Boosty временно недоступен.' })), '');
});

test('Telegram linking offers actions only through OIDC or a configured bot', () => {
  assert.equal(hasTelegramLinkActions('oidc', ''), true);
  assert.equal(hasTelegramLinkActions('legacy-widget', 'manacost_auth_bot'), true);
  assert.equal(hasTelegramLinkActions('disabled', ''), false);
  assert.equal(hasTelegramLinkActions('legacy-widget', ''), false);
});
