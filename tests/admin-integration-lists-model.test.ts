import assert from 'node:assert/strict';
import {
  boostyFilterOptions,
  boostySiteAccess,
  boostySubscription,
  chatStateLabel,
  filterBoostySubscribers,
  filterTelegramAccounts,
  telegramAccess,
  telegramFilterOptions,
  unreadableTelegramChats,
  type BoostySubscriberRow,
  type TelegramAdminAccount,
} from '../src/features/adminIntegrationListModel.js';

const subscriber = (id: string, values: Partial<BoostySubscriberRow> = {}): BoostySubscriberRow => ({
  id, name: id, email: `${id}@example.test`, hasEmail: true, avatarUrl: '', status: 'active', subscribed: true, active: true, paid: true,
  hasActivePaidAccess: true, willRenew: true, blacklisted: false, canWrite: true, audienceType: 'boosty-paid', contactStatus: '',
  level: { id: 1, name: 'Легенда', price: 500, currency: 'RUB' }, money: { currentPrice: 500, totalPayments: 1500, currency: 'RUB' },
  dates: { subscribedAt: '2026-01-01T00:00:00.000Z', unsubscribedAt: null, nextPaymentAt: '2026-10-14T00:00:00.000Z' }, siteAccess: true, ...values,
});
const rows = [
  subscriber('paid-site'),
  subscriber('paid-unmapped', { siteAccess: false, level: { id: 2, name: 'Старый тариф', price: 100, currency: 'RUB' } }),
  subscriber('free', { hasActivePaidAccess: false, siteAccess: false, paid: false, level: { id: null, name: '', price: 0, currency: 'RUB' } }),
  subscriber('gone', { active: false, hasActivePaidAccess: false, siteAccess: false, willRenew: false, status: 'inactive' }),
];

assert.deepEqual(boostyFilterOptions(rows).map(option => [option.id, option.count]), [['all', 4], ['site', 1], ['paid', 2], ['free', 2], ['inactive', 1]]);
assert.equal(boostyFilterOptions(rows)[1].label, 'Открывают сайт');
const ids = (list: Array<{ id: string }>) => list.map(item => item.id);
assert.deepEqual(ids(filterBoostySubscribers(rows, { search: '', level: 'all', access: 'paid' })), ['paid-site', 'paid-unmapped']);
assert.deepEqual(ids(filterBoostySubscribers(rows, { search: '', level: 'Без уровня', access: 'all' })), ['free']);
assert.deepEqual(ids(filterBoostySubscribers(rows, { search: ' СТАРЫЙ ', level: 'all', access: 'all' })), ['paid-unmapped']);
assert.deepEqual(ids(filterBoostySubscribers(rows, { search: '', level: 'all', access: 'inactive' })), ['gone']);

assert.deepEqual(boostySubscription(rows[0]), { tone: 'ok', label: 'Активна', detail: 'автопродление включено' });
assert.deepEqual(boostySubscription(subscriber('x', { willRenew: false })), { tone: 'warn', label: 'Активна', detail: 'автопродление выключено' });
assert.deepEqual(boostySubscription(rows[3]), { tone: 'muted', label: 'Не активна', detail: '' });
assert.deepEqual(boostySubscription(rows[2]), { tone: 'muted', label: 'Бесплатная', detail: '' });
assert.deepEqual(boostySiteAccess(rows[0]), { tone: 'ok', label: 'Открывает сайт', detail: '' });
assert.deepEqual(boostySiteAccess(rows[1]), { tone: 'warn', label: 'Тариф не распознан', detail: 'платит, но разделы сайта не открыты' });
assert.deepEqual(boostySiteAccess(rows[2]), { tone: 'muted', label: 'Не открывает сайт', detail: '' });

const account = (id: string, values: Partial<TelegramAdminAccount> = {}): TelegramAdminAccount => ({
  id, profileId: id.toUpperCase(), name: id, email: `${id}@example.test`, role: 'user', blockedAt: '', telegramId: '1', telegramOidcId: '',
  telegramUsername: id, contactTelegram: '', photoUrl: '', hasTelegramIdentity: true, hasContactOnly: false, canBeChecked: true, hasAccess: true,
  telegramHasAccess: true, accessState: 'access', source: 'telegram', message: '', checkedAt: '2026-09-30T00:00:00.000Z', updatedAt: '', stale: false,
  chats: [], boostyHasAccess: false, createdAt: '', userUpdatedAt: '', ...values,
});
const accounts = [
  account('member'),
  account('linked', { telegramHasAccess: false, hasAccess: false, accessState: 'checkable', stale: true }),
  account('nick-only', { telegramId: '', telegramHasAccess: false, hasAccess: false, accessState: 'contact-only' }),
  account('banned', { telegramHasAccess: false, hasAccess: false, accessState: 'blocked', blockedAt: '2026-09-01T00:00:00.000Z' }),
];
assert.deepEqual(telegramFilterOptions(accounts).map(option => [option.id, option.count]), [
  ['all', 4], ['access', 1], ['checkable', 1], ['contact-only', 1], ['stale', 1], ['blocked', 1],
]);
assert.deepEqual(ids(filterTelegramAccounts(accounts, { search: '', access: 'stale' })), ['linked']);
assert.deepEqual(ids(filterTelegramAccounts(accounts, { search: 'NICK', access: 'all' })), ['nick-only']);
assert.deepEqual(ids(filterTelegramAccounts(accounts, { search: '', access: 'access' })), ['member']);

assert.deepEqual(telegramAccess(accounts[0]), { tone: 'ok', label: 'Есть доступ' });
assert.deepEqual(telegramAccess(accounts[1]), { tone: 'muted', label: 'Нет в VIP-группах' });
assert.deepEqual(telegramAccess(accounts[2]), { tone: 'warn', label: 'Telegram не привязан' });
assert.deepEqual(telegramAccess(accounts[3]), { tone: 'bad', label: 'Заблокирован' });
assert.deepEqual(telegramAccess(account('other', { telegramHasAccess: false, hasAccess: false, accessState: 'no-access' })), { tone: 'muted', label: 'Нет доступа' });

assert.deepEqual(chatStateLabel({ chatId: '-1', status: 'member', isMember: true }), { member: true, label: 'состоит' });
assert.deepEqual(chatStateLabel({ chatId: '-1', status: 'left' }), { member: false, label: 'вышел из группы' });
assert.deepEqual(chatStateLabel({ chatId: '-1', ok: false, error: 'Bad Request: chat not found' }), { member: false, label: 'бот не видит эту группу' });
assert.deepEqual(chatStateLabel({ chatId: '-1', ok: false, error: 'timeout' }), { member: false, label: 'ошибка проверки: timeout' });
assert.deepEqual(chatStateLabel({ chatId: '-1', hasAccess: true }), { member: true, label: 'состоит' });
assert.deepEqual(chatStateLabel({ chatId: '-1' }), { member: false, label: 'не состоит' });

const broken = { chatId: '-5077378176', ok: false, error: 'Bad Request: chat not found' };
assert.deepEqual(unreadableTelegramChats([
  account('a', { chats: [{ chatId: '-100', status: 'member', isMember: true }, broken] }),
  account('b', { chats: [{ chatId: '-100', status: 'left' }, broken] }),
  account('c', { chats: [{ chatId: '-100', ok: false, error: 'timeout' }] }),
]), ['-5077378176']);
assert.deepEqual(unreadableTelegramChats(accounts), []);

console.log('admin integration lists model: ok');
