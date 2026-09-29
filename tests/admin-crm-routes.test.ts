import assert from 'node:assert/strict';
import express from 'express';
import { createAdminCrmRouter, normalizeAdminTags } from '../server/adminCrmRoutes.js';
import { createAdminCrmTestDb } from './helpers/adminCrmTestDb.js';
import { ADMIN_USER_SEGMENT_IDS, adminUserSegmentWhere } from '../server/adminCrmSegments.js';

const { db, iso, addUser, setSubscription, addCheck, grant } = createAdminCrmTestDb();

addUser('admin-1', { name: 'Главный админ', role: 'admin' });
addUser('payer', { name: 'Платящий' }); setSubscription('payer', true);
addUser('lifer', { name: 'Навсегда' }); grant('lifer', null);
addUser('soon', { name: 'Скоро истекает' }); grant('soon', 3);
addUser('later', { name: 'Истекает не скоро' }); grant('later', 40);
addUser('gone', { name: 'Ушёл' }); setSubscription('gone', false); addCheck('gone', true, 10); addCheck('gone', false, 1);
addUser('ancient', { name: 'Давно ушёл' }); setSubscription('ancient', false); addCheck('ancient', true, 90);
addUser('fresh', { name: 'Новичок', created_at: iso(-2) });
addUser('banned', { name: 'Бан', blocked_at: iso(-5) });

db.prepare(`INSERT INTO identities (user_id, provider, provider_user_id, username, verified_at, created_at, updated_at) VALUES ('payer', 'telegram', '555', 'payer_tg', ?, ?, ?)`).run(iso(-50), iso(-50), iso(-50));
// Every refresh cycle writes one row per provider, as server/index.ts does for boosty, telegram and patreon.
for (const [daysAgo, boosty, telegram] of [[60, false, false], [30, true, false], [20, true, false], [5, true, true], [2, true, false]] as const) {
  addCheck('payer', boosty, daysAgo, 'boosty');
  addCheck('payer', telegram, daysAgo, 'telegram');
  addCheck('payer', false, daysAgo, 'patreon');
}
db.prepare(`INSERT INTO referral_links (id, slug, label, campaign) VALUES ('ref_yt', 'youtube', 'YouTube сентябрь', 'sep')`).run();
db.prepare(`INSERT INTO user_referrals (user_id, referral_id, click_id, clicked_at, attributed_at) VALUES ('payer', 'ref_yt', 7, '2026-09-02T10:00:00.000Z', '2026-09-02T10:05:00.000Z')`).run();
db.prepare(`INSERT INTO contests (id, title) VALUES ('c1', 'Арена-марафон')`).run();
db.prepare(`INSERT INTO contest_entries (id, contest_id, user_id, status, created_at) VALUES ('e1', 'c1', 'payer', 'approved', ?)`).run(iso(-15));
db.prepare(`INSERT INTO mailing_contacts (id, email, user_id, consent_status, consented_at) VALUES ('m1', 'payer@example.test', 'payer', 'subscribed', ?)`).run(iso(-40));
db.prepare(`INSERT INTO mailing_deliveries (campaign_id, contact_id, status, accepted_at, updated_at) VALUES ('k1', 'm1', 'accepted', ?, ?), ('k2', 'm1', 'failed', NULL, ?)`).run(iso(-7), iso(-7), iso(-6));
db.prepare(`INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at) VALUES ('admin-1', 'user.updated', 'user', 'payer', '{"role":{"from":"user","to":"user"}}', ?)`).run(iso(-4));
db.prepare(`INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at) VALUES ('admin-1', 'parser.run', 'parser-control', 'payer', '{}', ?)`).run(iso(-4));

// Segment SQL is shared with GET /api/admin/users, so it is verified against the real schema here.
const segmentIds = (segment: string) => db.prepare(`
  SELECT u.id FROM users u
  LEFT JOIN subscriptions s ON s.user_id = u.id
  LEFT JOIN manual_subscription_grants g ON g.user_id = u.id
  WHERE ${adminUserSegmentWhere(segment as never)} ORDER BY u.id
`).all().map(row => String(row.id));

assert.deepEqual(ADMIN_USER_SEGMENT_IDS, ['all', 'paying', 'manual', 'expiring', 'lapsed', 'new', 'blocked', 'admins']);
assert.equal(segmentIds('all').length, 9);
assert.deepEqual(segmentIds('paying'), ['payer']);
assert.deepEqual(segmentIds('manual'), ['later', 'lifer', 'soon']);
assert.deepEqual(segmentIds('expiring'), ['soon']);
assert.deepEqual(segmentIds('lapsed'), ['gone']);
assert.deepEqual(segmentIds('new'), ['fresh']);
assert.deepEqual(segmentIds('blocked'), ['banned']);
assert.deepEqual(segmentIds('admins'), ['admin-1']);
assert.throws(() => adminUserSegmentWhere('everyone' as never), /segment/i);

assert.deepEqual(normalizeAdminTags([' VIP ', 'vip', 'Стример', '', 'x'.repeat(33)]), ['vip', 'стример']);
assert.throws(() => normalizeAdminTags(Array.from({ length: 13 }, (_, index) => `t${index}`)), /не больше 12/);
assert.throws(() => normalizeAdminTags('vip'), /массив/);

let csrf = true;
const audit: Array<{ action: string; entityId: string }> = [];
const app = express();
app.use(express.json());
app.use('/api', createAdminCrmRouter({
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  csrfAllowed: () => csrf,
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  repository: {
    get: (sql, ...params) => (db.prepare(sql).get(...params) as Record<string, unknown> | undefined) ?? null,
    all: (sql, ...params) => db.prepare(sql).all(...params) as Record<string, unknown>[],
    run: (sql, ...params) => { const result = db.prepare(sql).run(...params); return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) }; },
  },
  recordAudit: (actorId, action, entityId, details) => {
    audit.push({ action, entityId });
    db.prepare(`INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at) VALUES (?, ?, 'user', ?, ?, ?)`)
      .run(actorId, action, entityId, JSON.stringify(details), new Date().toISOString());
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/admin/crm`;
const call = (path: string, init: RequestInit = {}, admin = true) => fetch(`${base}${path}`, {
  ...init,
  headers: { 'Content-Type': 'application/json', ...(admin ? { 'X-Admin': 'yes' } : {}), ...(init.headers ?? {}) },
});

try {
  for (const path of ['/segments', '/people/payer']) {
    const forbidden = await call(path, {}, false);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.get('cache-control'), 'private, no-store');
  }

  const segments = await (await call('/segments')).json() as { segments: Array<{ id: string; label: string; count: number }> };
  assert.deepEqual(segments.segments.map(segment => [segment.id, segment.count]), [
    ['all', 9], ['paying', 1], ['manual', 3], ['expiring', 1], ['lapsed', 1], ['new', 1], ['blocked', 1], ['admins', 1],
  ]);
  assert.equal(segments.segments[4].label, 'Потеряли доступ');

  assert.equal((await call('/people/nobody')).status, 404);

  const cardResponse = await call('/people/payer');
  assert.equal(cardResponse.status, 200);
  const cardText = await cardResponse.text();
  assert.doesNotMatch(cardText, /secret-hash|never-returned|password/);
  const card = JSON.parse(cardText);
  assert.equal(card.person.name, 'Платящий');
  assert.equal(card.access.hasAccess, true);
  assert.equal(card.access.source, 'boosty');
  assert.equal(card.access.manual, null);
  assert.deepEqual(card.identities.map((identity: { provider: string; username: string }) => [identity.provider, identity.username]), [['telegram', 'payer_tg']]);
  // Flips are tracked per provider; a provider that never granted access produces no entries.
  assert.deepEqual(
    card.accessHistory.map((entry: { source: string; hasAccess: boolean }) => [entry.source, entry.hasAccess]),
    [['telegram', false], ['telegram', true], ['boosty', true]],
  );
  assert.deepEqual(card.contests.map((entry: { title: string; status: string }) => [entry.title, entry.status]), [['Арена-марафон', 'approved']]);
  assert.equal(card.mailing.consentStatus, 'subscribed');
  assert.equal(card.mailing.delivered, 1);
  assert.equal(card.mailing.failed, 1);
  assert.deepEqual(card.audit.map((entry: { action: string }) => entry.action), ['user.updated']);
  assert.equal(card.audit[0].actorName, 'Главный админ');
  assert.deepEqual(card.referral, { label: 'YouTube сентябрь', slug: 'youtube', campaign: 'sep', clickedAt: '2026-09-02T10:00:00.000Z' });
  assert.deepEqual(card.notes, []);
  assert.deepEqual(card.tags, []);

  const soon = await (await call('/people/soon')).json();
  assert.equal(soon.referral, null);
  assert.equal(soon.access.hasAccess, true);
  assert.equal(soon.access.manual.active, true);
  assert.equal(soon.access.manual.note, 'приз конкурса');
  assert.equal(soon.access.source, 'manual-access');
  assert.equal(soon.mailing, null);

  csrf = false;
  assert.equal((await call('/people/payer/notes', { method: 'POST', body: JSON.stringify({ body: 'x' }) })).status, 403);
  csrf = true;
  assert.equal((await call('/people/payer/notes', { method: 'POST', body: JSON.stringify({ body: '   ' }) })).status, 400);
  assert.equal((await call('/people/payer/notes', { method: 'POST', body: JSON.stringify({ body: 'x'.repeat(2001) }) })).status, 400);
  assert.equal((await call('/people/nobody/notes', { method: 'POST', body: JSON.stringify({ body: 'hi' }) })).status, 404);

  const created = await call('/people/payer/notes', { method: 'POST', body: JSON.stringify({ body: '  Просил продлить до конца месяца  ' }) });
  assert.equal(created.status, 201);
  const { note } = await created.json();
  assert.equal(note.body, 'Просил продлить до конца месяца');
  assert.equal(note.authorName, 'Главный админ');

  const tags = await call('/people/payer/tags', { method: 'PUT', body: JSON.stringify({ tags: ['VIP', 'стример', 'vip'] }) });
  assert.equal(tags.status, 200);
  assert.deepEqual((await tags.json()).tags, ['vip', 'стример']);
  assert.equal((await call('/people/payer/tags', { method: 'PUT', body: JSON.stringify({ tags: 'vip' }) })).status, 400);
  assert.equal((await call('/people/payer/tags', { method: 'PUT', body: JSON.stringify({ tags: Array.from({ length: 13 }, (_, index) => `t${index}`) }) })).status, 400);

  const withNotes = await (await call('/people/payer')).json();
  assert.equal(withNotes.notes.length, 1);
  assert.deepEqual(withNotes.tags, ['vip', 'стример']);
  assert.deepEqual(withNotes.audit.slice(0, 2).map((entry: { action: string }) => entry.action), ['user.tags.updated', 'user.note.added']);

  // A note id from another person cannot be deleted through this person's URL.
  assert.equal((await call(`/people/soon/notes/${note.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await call(`/people/payer/notes/${note.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await (await call('/people/payer')).json()).notes.length, 0);
  assert.deepEqual(audit.map(entry => entry.action), ['user.note.added', 'user.tags.updated', 'user.note.deleted']);

  // Tags are removed with the user.
  db.prepare(`DELETE FROM users WHERE id = 'payer'`).run();
  assert.equal(Number((db.prepare(`SELECT COUNT(*) AS count FROM admin_user_tags`).get() as { count: number }).count), 0);
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}

console.log('admin CRM routes: ok');
