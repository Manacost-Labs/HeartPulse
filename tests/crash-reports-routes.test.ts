import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import {
  CRASH_REPORT_KEEP_DAYS,
  createCrashReportRouter,
  createSqliteCrashReportRepository,
  initializeCrashReportRepository,
  readCrashReport,
  scrubCrashText,
} from '../server/modules/crashReports/public.js';
import { registerCrashReportsRateLimit } from '../server/app/registerCrashReports.js';

const report = (patch: Record<string, unknown> = {}) => ({
  v: 1, id: randomUUID(), app: 'hearthpulse', version: '0.15.0', ui: 'wpf', os: 'Microsoft Windows 10.0.26200 X64',
  runtime: '.NET 10.0.0', language: 'ru-RU', where: 'UI error', uptimeSeconds: 600, at: '2026-11-02T12:00:00Z',
  errors: [{ type: 'System.InvalidOperationException', message: 'Sequence contains no elements', stack: ['at Hearthpulse.Core.X.Y()'] }],
  ...patch,
});

// ---- the shape and the second scrub ---------------------------------------------------------------------------------

assert.ok(readCrashReport(report()));
for (const [field, value] of Object.entries({ v: 2, app: 'other', id: '2026-11-02', ui: 'web', where: 'anything', version: 'v 1', at: 'yesterday' })) {
  assert.equal(readCrashReport(report({ [field]: value })), null, `${field} must be the app's`);
}
assert.equal(readCrashReport(report({ errors: [] })), null);
assert.equal(readCrashReport(report({ errors: [{ type: 'Not a type!', message: '', stack: [] }] })), null);
assert.equal(readCrashReport(report({ errors: [{ type: 'X', message: 'x'.repeat(400), stack: [] }] })), null);
assert.equal(readCrashReport(report({ extra: 'Zulut#2187' }))?.toString().includes('Zulut'), false, 'unknown fields are not kept');
const scrubbed = readCrashReport(report({
  errors: [{ type: 'System.IO.IOException', message: 'Zulut#2187 zulut@example.com 10.0.0.1 123456789 C:\\Users\\zulut\\x.db /home/zulut/x',
    stack: ['at A.B() in C:\\src\\A.cs:line 5'] }],
}));
assert.ok(scrubbed);
assert.equal(scrubbed.errors[0].message, '<name> <email> <ip> <number> <path>');
assert.equal(scrubbed.errors[0].stack[0], 'at A.B() in <path>');
assert.ok(!JSON.stringify(scrubbed).includes('zulut'));
// The app's rules again: names in quotes and key=value, whole paths with spaces, paths under the profile.
for (const [text, expected] of [
  ["The given key 'Иван Петров' was not present", "The given key '<value>' was not present"],
  ['Could not open D:\\Иван Петров\\Logs\\Power.log', 'Could not open <path>'],
  ['Bad file %USERPROFILE%\\OneDrive - Компания\\x.hpr', 'Bad file <path>'],
  ['Entity=Ivan tag=ZONE', 'Entity=<value> tag=<value>'],
]) {
  assert.equal(scrubCrashText(text, 300), expected);
}

// ---- the route ------------------------------------------------------------------------------------------------------

const database = new DatabaseSync(':memory:');
initializeCrashReportRepository(() => database);
const repository = createSqliteCrashReportRepository(() => database);
let clock = Date.UTC(2026, 10, 2, 12);
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api', createCrashReportRouter({ repository, setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'), now: () => clock }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const post = (body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/v1/crash-reports`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const rows = () => Number((database.prepare('SELECT COUNT(*) AS n FROM crash_reports').get() as { n: number }).n);

try {
  const first = report();
  assert.equal((await post(first)).status, 201);
  assert.equal((await post(first)).status, 201, 'a resend is taken, not stored twice');
  assert.equal(rows(), 1);
  assert.equal((await post(report({ where: 'elsewhere' }))).status, 400);
  const huge = report({ errors: Array.from({ length: 5 }, () => ({ type: 'X', message: 'm', stack: Array.from({ length: 40 }, () => 'a'.repeat(300)) })) });
  assert.equal((await post(huge)).status, 413);
  // No address, no account: only the report and when it came.
  const columns = (database.prepare('PRAGMA table_info(crash_reports)').all() as Array<{ name: string }>).map(column => column.name);
  assert.deepEqual(columns, ['id', 'received_at', 'version', 'ui', 'error_type', 'report_json']);
  // Kept 90 days.
  clock += (CRASH_REPORT_KEEP_DAYS + 1) * 86_400_000;
  assert.equal(repository.prune(clock), 1);
  assert.equal(rows(), 0);
} finally {
  server.close();
}

// Ten reports an hour from one address.
const limited = express();
registerCrashReportsRateLimit(limited);
limited.post('/api/v1/crash-reports', (_request, response) => { response.status(201).end(); });
const limitServer = limited.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { limitServer.once('listening', resolve); limitServer.once('error', reject); });
try {
  const limitAddress = limitServer.address();
  assert.ok(limitAddress && typeof limitAddress === 'object');
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await fetch(`http://127.0.0.1:${limitAddress.port}/api/v1/crash-reports`, { method: 'POST' })).status);
  }
  assert.deepEqual(statuses, [...Array(10).fill(201), 429]);
} finally {
  limitServer.close();
}
console.log('crash reports routes: ok');
