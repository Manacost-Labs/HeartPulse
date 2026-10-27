import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAdminAuditLog } from '../server/adminAuditLog.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT NOT NULL, action TEXT NOT NULL,
    entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  INSERT INTO users (id, name) VALUES ('admin-1', '  Админ  ');
`);
let failInsert = false;
const warnings: string[] = [];
const log = createAdminAuditLog({
  run: (sql, ...params) => {
    if (failInsert) throw new Error('database is locked');
    return sqlite.prepare(sql).run(...params as never[]);
  },
  all: <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).all(...params as never[]) as T[],
}, { now: () => new Date('2026-10-27T10:00:00.000Z'), warn: message => { warnings.push(message); } });

log.record('admin-1', 'parser-control.policy', 'parser-control', 'policy', { mode: 'auto' });
log.contentRecorder('article')({ id: 'admin-1' }, 'article.deleted', 'a-1', { title: 'Гайд' });
assert.deepEqual(
  sqlite.prepare('SELECT action, entity_type, entity_id, details_json, created_at FROM admin_audit_log ORDER BY id').all()
    .map(row => ({ ...row })),
  [
    { action: 'parser-control.policy', entity_type: 'parser-control', entity_id: 'policy', details_json: '{"mode":"auto"}', created_at: '2026-10-27T10:00:00.000Z' },
    { action: 'article.deleted', entity_type: 'article', entity_id: 'a-1', details_json: '{"title":"Гайд"}', created_at: '2026-10-27T10:00:00.000Z' },
  ],
);

// The content recorder runs after the change is stored: a failed insert is reported, never thrown.
failInsert = true;
assert.doesNotThrow(() => log.contentRecorder('gallery')({ id: 'admin-1' }, 'gallery.deleted', 'g-1'));
assert.deepEqual(warnings, ['[admin-audit] gallery.deleted g-1 was not recorded:']);
assert.throws(() => log.record('admin-1', 'user.updated', 'user', 'u-1'), /database is locked/);
failInsert = false;

sqlite.prepare("INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at) VALUES ('gone', 'parser-control.run', 'parser-control', 'run', 'not json', '2026-10-27T11:00:00.000Z')").run();
assert.deepEqual(log.listParserControl(10), [
  { id: '3', actor: { id: 'gone', name: '' }, action: 'parser-control.run', entityId: 'run', details: {}, createdAt: '2026-10-27T11:00:00.000Z' },
  { id: '1', actor: { id: 'admin-1', name: 'Админ' }, action: 'parser-control.policy', entityId: 'policy', details: { mode: 'auto' }, createdAt: '2026-10-27T10:00:00.000Z' },
]);
assert.equal(log.listParserControl(1).length, 1);

console.log('admin audit log tests passed');
