import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import {
  createSqliteTrackerEventRepository,
  createTrackerAccountDataRouter,
  initializeTrackerEventRepository,
} from '../server/modules/trackerIngestion/public.js';

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES (\'user-1\'), (\'user-2\');');
initializeTrackerEventRepository(() => database);
const repository = createSqliteTrackerEventRepository(() => database);
const event = (index: number) => ({
  eventId: `0199b2d2-7cc7-7d75-bcea-7d28b628ef${String(index).padStart(2, '0')}`,
  type: 'constructed_match' as const,
  schemaVersion: 2 as const,
  occurredAt: `2026-10-${10 + index}T12:00:00.000Z`,
  payload: { format: 'standard', result: 'win', durationSeconds: 500, playerClass: 'MAGE', opponentClass: 'ROGUE' },
});
repository.acknowledge('user-1', [event(1), event(2), event(3)], 1_000);
repository.acknowledge('user-2', [event(4)], 1_000);

const deleted: string[] = [];
const app = express();
app.use('/api', createTrackerAccountDataRouter({
  userAuth: request => (request.headers.cookie === 'session=1' ? { id: 'user-1' } : null),
  repository,
  setPrivateNoStore: response => response.set('Cache-Control', 'no-store'),
  onDeleted: userId => deleted.push(userId),
  now: () => Date.parse('2026-10-23T12:00:00Z'),
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const url = (path: string) => `http://127.0.0.1:${address.port}/api/account/tracker-data${path}`;
const session = { cookie: 'session=1' };

try {
  for (const [path, method] of [['', 'GET'], ['/export', 'GET'], ['', 'DELETE']] as const) {
    const anonymous = await fetch(url(path), { method });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  }

  assert.deepEqual(await (await fetch(url(''), { headers: session })).json(),
    { events: 3, firstOccurredAt: '2026-10-11T12:00:00.000Z', lastOccurredAt: '2026-10-13T12:00:00.000Z' });

  // The export is the account's own events only, as stored, oldest first.
  const exported = await fetch(url('/export'), { headers: session });
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get('content-disposition'), 'attachment; filename="hearthpulse-tracker-data-2026-10-23.json"');
  assert.equal(exported.headers.get('cache-control'), 'no-store');
  const body = await exported.json();
  assert.equal(body.exportedAt, '2026-10-23T12:00:00.000Z');
  assert.deepEqual(body.events.map((item: { eventId: string }) => item.eventId), [event(1), event(2), event(3)].map(item => item.eventId));
  assert.deepEqual(body.events[0].payload, event(1).payload);
  assert.equal(body.events[0].receivedAt, 1_000);

  // Deletion is total for the account and leaves other accounts alone.
  assert.deepEqual(await (await fetch(url(''), { method: 'DELETE', headers: session })).json(), { deleted: 3 });
  assert.deepEqual(deleted, ['user-1']);
  assert.deepEqual(await (await fetch(url(''), { headers: session })).json(), { events: 0, firstOccurredAt: null, lastOccurredAt: null });
  assert.deepEqual((await (await fetch(url('/export'), { headers: session })).json()).events, []);
  assert.equal(repository.summarize('user-2').events, 1);
} finally {
  server.close();
}

console.log('tracker account data routes: ok');
