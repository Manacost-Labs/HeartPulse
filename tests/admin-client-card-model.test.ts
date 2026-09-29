import assert from 'node:assert/strict';
import type { AdminCrmPerson } from '../src/modules/adminCrm/api/adminCrmClient.js';
import {
  accessBadge,
  accessSourceLabel,
  auditActionLabel,
  buildPersonTimeline,
  daysUntil,
  identityProviderLabel,
} from '../src/modules/adminCrm/ui/adminClientCardModel.js';

assert.equal(accessSourceLabel('none'), 'Нет подписки');
assert.equal(accessSourceLabel(''), 'Нет подписки');
assert.equal(accessSourceLabel('boosty'), 'Boosty');
assert.equal(accessSourceLabel('boosty,manual-access'), 'Boosty + Выдан вручную');
assert.equal(accessSourceLabel('none,manual-access'), 'Выдан вручную');
assert.equal(accessSourceLabel('future-provider'), 'future-provider');
assert.equal(identityProviderLabel('telegram_oidc'), 'Telegram (вход)');

assert.equal(auditActionLabel('user.updated', { role: { from: 'user', to: 'admin' } }), 'назначен администратором');
assert.equal(auditActionLabel('user.updated', { blocked: { from: false, to: true } }), 'заблокирован');
assert.equal(auditActionLabel('user.updated', { manualAccess: { from: { enabled: false }, to: { enabled: true, expiresAt: null } } }), 'выдан доступ навсегда');
assert.match(auditActionLabel('user.updated', { manualAccess: { to: { enabled: true, expiresAt: '2026-10-29T00:00:00.000Z' } } }), /^выдан доступ до /);
assert.equal(auditActionLabel('user.updated', { manualAccess: { to: { enabled: false, expiresAt: null } } }), 'отозван ручной доступ');
assert.equal(auditActionLabel('user.updated', {}), 'изменён профиль');
assert.equal(auditActionLabel('user.tags.updated', { from: [], to: ['vip', 'стример'] }), 'теги: vip, стример');
assert.equal(auditActionLabel('user.tags.updated', { from: ['vip'], to: [] }), 'теги очищены');
assert.equal(auditActionLabel('custom.action', {}), 'custom.action');

const now = Date.parse('2026-09-29T12:00:00.000Z');
assert.equal(daysUntil('2026-10-02T12:00:00.000Z', now), 3);
assert.equal(daysUntil('2026-09-28T12:00:00.000Z', now), -1);
assert.equal(daysUntil(null, now), null);
assert.equal(daysUntil('not a date', now), null);

const card: AdminCrmPerson = {
  person: {
    id: 'u1', name: 'Игрок', email: 'u1@example.test', role: 'user', country: '', createdAt: '2025-03-12T10:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z', blockedAt: null, newsletterOptIn: false, contacts: { telegram: '', vk: '', email: '' },
  },
  identities: [],
  access: { hasAccess: true, source: 'boosty', message: '', checkedAt: '2026-09-29T11:00:00.000Z', manual: null },
  accessHistory: [
    { at: '2026-09-14T00:00:00.000Z', source: 'boosty', hasAccess: true },
    { at: '2026-08-14T00:00:00.000Z', source: 'boosty', hasAccess: false },
  ],
  contests: [{ contestId: 'c1', title: 'Арена-марафон', status: 'approved', createdAt: '2026-09-02T00:00:00.000Z' }],
  mailing: null,
  notes: [],
  tags: [],
  audit: [{ id: 7, action: 'user.note.added', actorId: 'a1', actorName: 'Админ', details: {}, createdAt: '2026-09-20T00:00:00.000Z' }],
};
const timeline = buildPersonTimeline(card);
assert.deepEqual(timeline.map(event => event.title), [
  'Добавлена заметка',
  'Появился доступ',
  'Конкурс «Арена-марафон»',
  'Доступ пропал',
  'Зарегистрировался',
]);
assert.deepEqual(timeline.map(event => event.tone), ['neutral', 'good', 'neutral', 'bad', 'neutral']);
assert.equal(timeline[2].detail, 'заявка одобрена');
assert.equal(timeline[0].detail, 'администратор Админ');
assert.equal(buildPersonTimeline({ ...card, person: { ...card.person, createdAt: 'broken' }, accessHistory: [], contests: [], audit: [] }).length, 0);

const manual = (expiresAt: string | null, active = true) => ({ active, grantedBy: 'Админ', grantedAt: '', expiresAt, revokedBy: null, revokedAt: null, note: '' });
assert.deepEqual(accessBadge(card, now), { tone: 'ok', text: 'Есть доступ' });
assert.equal(accessBadge({ ...card, person: { ...card.person, blockedAt: '2026-09-01T00:00:00.000Z' } }, now).text, 'Заблокирован');
assert.equal(accessBadge({ ...card, access: { ...card.access, manual: manual(null) } }, now).text, 'Доступ навсегда');
assert.deepEqual(accessBadge({ ...card, access: { ...card.access, manual: manual('2026-10-02T12:00:00.000Z') } }, now), { tone: 'warn', text: 'Доступ истекает через 3 дн.' });
assert.equal(accessBadge({ ...card, access: { ...card.access, manual: manual('2026-12-02T12:00:00.000Z') } }, now).tone, 'ok');
assert.deepEqual(accessBadge({ ...card, access: { ...card.access, hasAccess: false } }, now), { tone: 'bad', text: 'Доступ пропал' });
assert.deepEqual(accessBadge({ ...card, access: { ...card.access, hasAccess: false }, accessHistory: [] }, now), { tone: 'muted', text: 'Без доступа' });

console.log('admin client card model: ok');
