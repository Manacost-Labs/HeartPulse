import assert from 'node:assert/strict';
import express from 'express';
import { createAdminCrmRouter } from '../server/adminCrmRoutes.js';
import { readOverview } from '../server/adminCrmOverview.js';
import { createAdminCrmTestDb } from './helpers/adminCrmTestDb.js';

const { db, iso, addUser, setSubscription, addCheck, grant } = createAdminCrmTestDb();
const repository = {
  get: (sql: string, ...params: Array<string | number | null>) => (db.prepare(sql).get(...params) as Record<string, unknown> | undefined) ?? null,
  all: (sql: string, ...params: Array<string | number | null>) => db.prepare(sql).all(...params) as Record<string, unknown>[],
  run: (sql: string, ...params: Array<string | number | null>) => {
    const result = db.prepare(sql).run(...params);
    return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
  },
};
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const check = (userId: string, source: string, hasAccess: boolean, detail: object, at: string) => db.prepare(`
  INSERT INTO subscription_checks (user_id, source, has_access, detail_json, checked_at) VALUES (?, ?, ?, ?, ?)
`).run(userId, source, hasAccess ? 1 : 0, JSON.stringify(detail), at);

addUser('admin-1', { name: 'Главный админ', role: 'admin' });
addUser('payer', { name: 'Платящий' }); setSubscription('payer', true);
addUser('soon', { name: 'Скоро истекает' }); grant('soon', 3);
addUser('gone', { name: 'Ушёл' }); setSubscription('gone', false); addCheck('gone', true, 10); addCheck('gone', false, 1);
addUser('fresh', { name: 'Новичок', created_at: iso(-2) });
addUser('older', { name: 'Прошлый месяц', created_at: iso(-40) });

// Telegram: one of two VIP chats always fails; Boosty: most recent checks are stale.
for (const [index, userId] of ['payer', 'gone', 'fresh', 'soon'].entries()) {
  check(userId, 'telegram', false, { chats: [
    { chatId: '-100111', ok: true, isMember: false },
    { chatId: '-5077378176', ok: false, isMember: false, error: 'Bad Request: chat not found' },
  ] }, minutesAgo(10 + index));
  check(userId, 'boosty', userId === 'payer', { stale: userId !== 'payer', providerUnavailable: false }, minutesAgo(10 + index));
}
check('payer', 'telegram', false, { chats: [{ chatId: '-5077378176', ok: false, error: 'old failure' }] }, minutesAgo(60 * 5));

db.prepare(`INSERT INTO contests (id, title, status) VALUES ('c1', 'Арена-марафон', 'active')`).run();
db.prepare(`INSERT INTO contest_entries (id, contest_id, user_id, status, created_at) VALUES ('e1', 'c1', 'payer', 'pending', ?), ('e2', 'c1', 'gone', 'approved', ?)`).run(iso(-1), iso(-3));
db.prepare(`INSERT INTO mailing_campaigns (id, subject, status, created_at, completed_at, recipient_count, accepted_count, failed_count)
  VALUES ('m1', 'Мета недели', 'completed', ?, ?, 120, 117, 3)`).run(iso(-2), iso(-2));
db.prepare(`INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at)
  VALUES ('admin-1', 'user.updated', 'user', 'soon', '{"manualAccess":{"to":{"enabled":true,"expiresAt":null}}}', ?)`).run(iso(-0.5));

// A burst of read-only entries newer than the real admin action must not hide it.
for (let index = 0; index < 80; index += 1) {
  db.prepare(`INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at)
    VALUES ('admin-1', 'parser-control.audit.read', 'parser-control', 'x', '{}', ?)`).run(iso(-index / 10_000));
}
const overview = readOverview(repository, new Date());

// Alerts are ordered by severity and point to the place where the operator acts.
assert.deepEqual(overview.alerts.map(alert => [alert.id, alert.severity]), [
  ['telegram-chat:-5077378176', 'critical'],
  ['boosty-stale', 'critical'],
  ['expiring-access', 'warning'],
  ['pending-contest-entries', 'warning'],
  ['mailing-failures', 'warning'],
  ['lapsed-access', 'info'],
]);
const telegram = overview.alerts[0];
assert.match(telegram.title, /-5077378176/);
assert.match(telegram.detail, /4 из 4/);
assert.match(telegram.detail, /chat not found/);
assert.deepEqual(overview.alerts[2].action, { section: 'users', segment: 'expiring', label: 'Показать' });
assert.equal(overview.alerts[3].action?.section, 'contests');
assert.match(overview.alerts[4].detail, /3 письма/);
assert.deepEqual(overview.alerts[5].action, { section: 'users', segment: 'lapsed', label: 'Показать' });

assert.equal(overview.kpis.totalUsers, 6);
assert.equal(overview.kpis.payingNow, 2); // provider access + active manual grant
assert.equal(overview.kpis.payingProvider, 1);
assert.equal(overview.kpis.manualAccess, 1);
assert.equal(overview.kpis.newUsers30d, 1);
assert.equal(overview.kpis.newUsersPrevious30d, 1);
assert.equal(overview.kpis.lapsed30d, 1);
assert.equal(overview.kpis.expiringSoon, 1);
assert.equal(overview.series.days.length, 30);
assert.equal(overview.series.newUsers.reduce((sum, value) => sum + value, 0), 1);
assert.equal(overview.series.newUsers.length, 30);
// Days are UTC dates; look them up by key so the test does not depend on the time of day.
const payingOn = (at: string) => overview.series.paying[overview.series.days.indexOf(at.slice(0, 10))];
assert.equal(payingOn(minutesAgo(10)), 1); // "payer" is the only user with access in recent checks
assert.equal(payingOn(iso(-10)), 1); // "gone" had access ten days ago

const kinds = overview.activity.map(item => item.kind);
assert.ok(kinds.includes('registration') && kinds.includes('admin') && kinds.includes('contest') && kinds.includes('mailing'));
assert.ok(overview.activity.every((item, index, list) => index === 0 || list[index - 1].at >= item.at));
const adminAction = overview.activity.find(item => item.kind === 'admin');
assert.ok(adminAction && adminAction.kind === 'admin');
assert.equal(adminAction.action, 'user.updated');
assert.equal(adminAction.actorName, 'Главный админ');
assert.equal(adminAction.targetName, 'Скоро истекает');
assert.equal(adminAction.userId, 'soon');
assert.deepEqual(adminAction.details, { manualAccess: { to: { enabled: true, expiresAt: null } } });
assert.ok(overview.activity.length <= 15);
assert.ok(!overview.activity.some(item => item.kind === 'admin' && item.action.endsWith('.read')));
assert.doesNotMatch(JSON.stringify(overview), /secret-hash|password/);

// subscription_checks holds millions of rows in production (three per user every 30 minutes), so the
// access-only queries must be answered from partial indexes, never by scanning check rows.
const plan = (sql: string) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map(row => String((row as { detail: string }).detail)).join(' | ');
assert.match(plan("SELECT 1 FROM subscription_checks c WHERE c.user_id = 'x' AND c.has_access = 1 AND c.checked_at >= '2026-09-01'"), /COVERING INDEX idx_subscription_checks_access_user/);
assert.match(plan("SELECT substr(checked_at, 1, 10) AS day, COUNT(DISTINCT user_id) FROM subscription_checks WHERE has_access = 1 AND checked_at >= '2026-09-01' GROUP BY day"), /COVERING INDEX idx_subscription_checks_access_time/);
assert.match(plan("SELECT detail_json FROM subscription_checks WHERE source = 'telegram' AND checked_at >= '2026-09-01' ORDER BY checked_at DESC LIMIT 1000"), /idx_subscription_checks_source_time/);

// Timeouts and rate limits are Telegram API trouble, not a broken chat: one warning, no per-chat alerts.
db.exec(`DELETE FROM subscription_checks WHERE source = 'telegram'`);
for (const [index, userId] of ['payer', 'gone', 'fresh', 'soon'].entries()) {
  check(userId, 'telegram', false, { chats: [
    { chatId: '-100111', ok: false, error: 'The operation was aborted due to timeout' },
    { chatId: '-100222', ok: false, error: 'Too Many Requests: retry after 5' },
  ] }, minutesAgo(10 + index));
}
const apiTrouble = readOverview(repository, new Date()).alerts.filter(alert => alert.id.startsWith('telegram'));
assert.deepEqual(apiTrouble.map(alert => [alert.id, alert.severity]), [['telegram-api', 'warning']]);
assert.match(apiTrouble[0].detail, /8 из 8/);

// With healthy integrations and no pending work there is nothing to alert about.
db.exec(`DELETE FROM subscription_checks; DELETE FROM contest_entries; DELETE FROM mailing_campaigns; DELETE FROM manual_subscription_grants;`);
assert.deepEqual(readOverview(repository, new Date()).alerts, []);

// Route: admin only, cached for the configured window.
let calls = 0;
const app = express();
app.use('/api', createAdminCrmRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  csrfAllowed: () => true,
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  repository: { ...repository, get: (sql, ...params) => { if (sql.includes('paying_now')) calls += 1; return repository.get(sql, ...params); } },
  recordAudit: () => undefined,
  overviewCacheMs: 60_000,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const url = `http://127.0.0.1:${address.port}/api/admin/crm/overview`;
try {
  const forbidden = await fetch(url);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');
  const first = await fetch(url, { headers: { 'X-Admin': 'yes' } });
  assert.equal(first.status, 200);
  const payload = await first.json();
  assert.equal(payload.kpis.totalUsers, 6);
  await fetch(url, { headers: { 'X-Admin': 'yes' } });
  assert.equal(calls, 1);
  await fetch(`${url}?fresh=1`, { headers: { 'X-Admin': 'yes' } });
  assert.equal(calls, 2);
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}

console.log('admin CRM overview: ok');
