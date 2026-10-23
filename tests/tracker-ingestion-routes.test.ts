import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import type { ApplicationAuthManager, ApplicationToken } from '../server/modules/applicationAuth/public.js';
import {
  createSqliteTrackerEventRepository,
  createTrackerIngestionRouter,
  initializeTrackerEventRepository,
} from '../server/modules/trackerIngestion/public.js';
import { validateStatisticsPayload } from '../server/modules/playerGames/public.js';

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES (\'user-1\');');
initializeTrackerEventRepository(() => database);
const repository = createSqliteTrackerEventRepository(() => database);
const token: ApplicationToken = {
  id: 'token-1',
  familyId: 'family-1',
  clientId: 'manacost-tracker',
  userId: 'user-1',
  scopes: ['tracker.write'],
  accessTokenHash: 'unused',
  refreshTokenHash: 'unused',
  accessExpiresAt: Date.now() + 60_000,
  refreshExpiresAt: Date.now() + 60_000,
  createdAt: Date.now(),
  revokedAt: null,
  replacedById: null,
};
const accessTokens = {
  authenticate: (value: unknown) => value === 'valid-token' ? token : null,
} as Pick<ApplicationAuthManager, 'authenticate'>;
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/v1', createTrackerIngestionRouter({
  accessTokens,
  repository,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  validatePayload: validateStatisticsPayload,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/v1/tracker/events/batch`;

const event = (eventId = randomUUID()) => ({
  eventId,
  type: 'constructed_match',
  schemaVersion: 1,
  occurredAt: '2026-09-11T12:00:00Z',
  payload: { matchId: 'match-1', turns: 8 },
});
const post = (events: unknown[], authorization = 'Bearer valid-token') => fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: authorization },
  body: JSON.stringify({ events }),
});

try {
  assert.equal((await post([event()], '')).status, 401);

  const eventId = randomUUID();
  const accepted = await post([event(eventId)]);
  assert.equal(accepted.status, 202);
  assert.equal(accepted.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await accepted.json(), { accepted: [eventId], rejected: [] });
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM tracker_profile_events').get()?.count, 1);

  const duplicate = await post([event(eventId)]);
  assert.equal(duplicate.status, 202);
  assert.deepEqual(await duplicate.json(), { accepted: [eventId], rejected: [] });
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM tracker_profile_events').get()?.count, 1);

  const malformedTimestampId = randomUUID();
  const malformedTimestamp = await post([{
    ...event(malformedTimestampId),
    occurredAt: '123',
  }]);
  assert.equal(malformedTimestamp.status, 202);
  assert.deepEqual(await malformedTimestamp.json(), {
    accepted: [],
    rejected: [{ eventId: malformedTimestampId, code: 'INVALID_EVENT' }],
  });

  const tooLargeCollectionId = randomUUID();
  const rejected = await post([{
    eventId: tooLargeCollectionId,
    type: 'collection_snapshot',
    schemaVersion: 1,
    occurredAt: '2026-09-11T12:00:00Z',
    payload: { cards: Array.from({ length: 20_001 }, (_, index) => ({ cardId: `CARD_${index}` })) },
  }]);
  assert.equal(rejected.status, 202);
  assert.deepEqual(await rejected.json(), {
    accepted: [],
    rejected: [{ eventId: tooLargeCollectionId, code: 'EVENT_LIMIT_EXCEEDED' }],
  });

  assert.equal((await post(Array.from({ length: 51 }, () => event()))).status, 400);

  // Version 2 carries the statistics fields. A bad statistics field never drops the
  // event: it is stored with its v1 lists, marked, and reported in `warnings`.
  const v2Id = randomUUID();
  const v2Invalid = randomUUID();
  const v3 = randomUUID();
  const oversized = randomUUID();
  const v2 = (eventId: ReturnType<typeof randomUUID>, payload: Record<string, unknown>) => ({ ...event(eventId), schemaVersion: 2, occurredAt: '2026-09-12T12:00:00Z', payload });
  const constructed = { format: 'standard', result: 'win', durationSeconds: 540, playerClass: 'MAGE', opponentClass: 'ROGUE',
    playerMulligan: { initial: ['CARD_1'], kept: ['CARD_1'] } };
  const versions = await post([v2(v2Id, { ...constructed, debugLog: 'dropped' }), v2(v2Invalid, { ...constructed, opponentClass: 'NEUTRAL' }),
    { ...event(v3), schemaVersion: 3 }, v2(oversized, { ...constructed, deckName: 'x', padding: 'x'.repeat(33 * 1024) })]);
  assert.equal(versions.status, 202);
  assert.deepEqual(await versions.json(), {
    accepted: [v2Id, v2Invalid],
    rejected: [{ eventId: v3, code: 'INVALID_EVENT' }, { eventId: oversized, code: 'EVENT_LIMIT_EXCEEDED' }],
    warnings: [{ eventId: v2Invalid, code: 'INVALID_STATISTICS', field: 'opponentClass' }],
  });
  const stored = repository.listEvents('user-1', { types: ['constructed_match'], since: '2026-09-12T00:00:00.000Z', limit: 10 });
  const byId = new Map(stored.map(item => [item.eventId, item]));
  assert.equal(byId.get(v2Id)?.schemaVersion, 2);
  assert.equal('debugLog' in (byId.get(v2Id)?.payload ?? {}), false, 'a v2 payload is stored normalized');
  assert.deepEqual(byId.get(v2Id)?.payload.playerMulligan, constructed.playerMulligan, 'v1 lists survive');
  assert.deepEqual(byId.get(v2Invalid)?.payload, { playerMulligan: constructed.playerMulligan, statisticsError: 'opponentClass' });
  assert.equal(repository.listEvents('user-1', { types: ['constructed_match'], since: null, limit: 10 }).length, 3);
  assert.deepEqual(repository.listEvents('user-1', { types: [], since: null, limit: 10 }), []);
  assert.deepEqual(repository.countEvents('user-1', ['constructed_match', 'arena_run'], 2), { constructed_match: 2 });

  // The account quota refuses only new ids; a replay of a stored id is still acknowledged.
  const full = createSqliteTrackerEventRepository(() => database);
  const replayId = v2Id;
  const overQuota = randomUUID();
  assert.deepEqual(full.acknowledge('user-1', [{ eventId: replayId, type: 'constructed_match', schemaVersion: 2,
    occurredAt: '2026-09-12T12:00:00.000Z', payload: {} }, { eventId: overQuota, type: 'constructed_match', schemaVersion: 1,
    occurredAt: '2026-09-12T12:00:00.000Z', payload: {} }], Date.now(), 1), [overQuota]);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  database.close();
}

console.log('tracker ingestion route contract tests passed');
