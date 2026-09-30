import assert from 'node:assert/strict';
import { personAccess, personContacts, personInitial } from '../src/modules/adminCrm/ui/peopleListModel.js';

const now = Date.parse('2026-09-30T12:00:00.000Z');
const base = { name: 'Игрок', email: 'igrok@example.test', role: 'user', subscription: { hasAccess: false, source: 'none' } };

assert.deepEqual(personAccess(base, now), { tone: 'muted', label: 'Нет доступа', detail: '' });
assert.deepEqual(personAccess({ ...base, subscription: { hasAccess: true, source: 'boosty' } }, now), { tone: 'ok', label: 'Подписка', detail: 'Boosty' });
assert.deepEqual(personAccess({ ...base, subscription: { hasAccess: true, source: 'boosty,telegram' } }, now), { tone: 'ok', label: 'Подписка', detail: 'Boosty + Telegram VIP' });
assert.deepEqual(
  personAccess({ ...base, lifetimeAccess: true, manualAccess: { enabled: true, expiresAt: null }, subscription: { hasAccess: true, source: 'manual-access' } }, now),
  { tone: 'ok', label: 'Доступ навсегда', detail: 'выдан вручную' },
);
assert.deepEqual(
  personAccess({ ...base, manualAccess: { enabled: true, expiresAt: '2026-10-03T12:00:00.000Z' }, subscription: { hasAccess: true, source: 'manual-access' } }, now),
  { tone: 'warn', label: 'Истекает через 3 дн.', detail: 'выдан вручную' },
);
const later = personAccess({ ...base, manualAccess: { enabled: true, expiresAt: '2026-12-01T12:00:00.000Z' }, subscription: { hasAccess: true, source: 'boosty,manual-access' } }, now);
assert.equal(later.tone, 'ok');
assert.match(later.label, /^До 1 дек/);
assert.equal(later.detail, 'выдан вручную + Boosty');
// A block outranks any access.
assert.deepEqual(
  personAccess({ ...base, blockedAt: '2026-09-01T00:00:00.000Z', subscription: { hasAccess: true, source: 'boosty' } }, now),
  { tone: 'bad', label: 'Заблокирован', detail: 'подписка сохранена' },
);
assert.equal(personAccess({ ...base, blockedAt: '2026-09-01T00:00:00.000Z', manualAccess: { enabled: true, expiresAt: null } }, now).detail, 'ручной доступ сохранён');
assert.equal(personAccess({ ...base, blockedAt: '2026-09-01T00:00:00.000Z' }, now).detail, '');

assert.deepEqual(personContacts({ ...base, telegramUsername: 'igrok_tg', contactVkUrl: 'https://vk.com/igrok', contactEmail: 'other@example.test' }), [
  { kind: 'Telegram', value: '@igrok_tg' },
  { kind: 'VK', value: 'vk.com/igrok' },
  { kind: 'Почта для связи', value: 'other@example.test' },
]);
assert.deepEqual(personContacts({ ...base, contactTelegram: '@manual', telegramUsername: 'ignored', contactEmail: 'igrok@example.test' }), [{ kind: 'Telegram', value: '@manual' }]);
assert.deepEqual(personContacts({ ...base, telegramId: '555' }), [{ kind: 'Telegram', value: 'ID 555' }]);
assert.deepEqual(personContacts(base), []);

assert.equal(personInitial({ ...base, name: ' игрок ' }), 'И');
assert.equal(personInitial({ ...base, name: '', email: 'zed@example.test' }), 'Z');
assert.equal(personInitial({ ...base, name: '', email: '' }), '?');

console.log('admin people list model: ok');
