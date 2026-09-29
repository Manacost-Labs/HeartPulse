import assert from 'node:assert/strict';
import { activityText, relativeTime, sparklinePoints, trend } from '../src/modules/adminCrm/ui/overviewModel.js';

assert.deepEqual(activityText({ id: 'r', kind: 'registration', at: '', name: 'igrok', userId: 'u1' }), { title: 'Новый пользователь', detail: 'igrok' });
assert.deepEqual(
  activityText({ id: 'c', kind: 'contest', at: '', name: 'igrok', contestTitle: 'Арена-марафон', status: 'pending', userId: 'u1' }),
  { title: 'Заявка на конкурс «Арена-марафон»', detail: 'igrok · ждёт проверки' },
);
assert.deepEqual(
  activityText({ id: 'm', kind: 'mailing', at: '', subject: 'Мета недели', accepted: 2341, failed: 3 }),
  { title: 'Рассылка «Мета недели»', detail: `доставлено ${(2341).toLocaleString('ru-RU')}, ошибок 3` },
);
assert.deepEqual(
  activityText({ id: 'a', kind: 'admin', at: '', action: 'user.updated', details: { blocked: { from: false, to: true } }, actorName: 'Админ', targetName: 'spam_bot', userId: 'u2' }),
  { title: 'Заблокирован', detail: 'Админ → spam_bot' },
);
assert.deepEqual(
  activityText({ id: 'a2', kind: 'admin', at: '', action: 'api-key.created', details: {}, actorName: 'Админ', targetName: '' }),
  { title: 'Создан ключ Public API', detail: 'Админ' },
);
assert.equal(activityText({ id: 'a3', kind: 'admin', at: '', action: 'parser-control.policy.update', details: {}, actorName: 'Админ', targetName: '' }).title, 'Изменены настройки парсеров');

assert.equal(trend(10, 0), null);
assert.deepEqual(trend(12, 10), { direction: 'up', percent: 20 });
assert.deepEqual(trend(9, 10), { direction: 'down', percent: -10 });
assert.deepEqual(trend(10, 10), { direction: 'flat', percent: 0 });

assert.equal(sparklinePoints([1], 100, 30), '');
assert.equal(sparklinePoints([0, 10], 100, 30), '0.0,27.0 100.0,3.0');
assert.equal(sparklinePoints([5, 5, 5], 100, 30), '0.0,27.0 50.0,27.0 100.0,27.0');

const now = Date.parse('2026-09-29T12:00:00.000Z');
assert.equal(relativeTime('2026-09-29T11:59:40.000Z', now), 'только что');
assert.equal(relativeTime('2026-09-29T11:15:00.000Z', now), '45 мин назад');
assert.equal(relativeTime('2026-09-29T07:00:00.000Z', now), '5 ч назад');
assert.match(relativeTime('2026-09-20T07:00:00.000Z', now), /20 сент/);
assert.equal(relativeTime('nope', now), '');

console.log('admin overview model: ok');
