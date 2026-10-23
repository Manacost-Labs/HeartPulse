import assert from 'node:assert/strict';
import { deleteTrackerData, fetchTrackerDataSummary } from '../src/modules/identity/api/trackerDataApi.js';

const realFetch = globalThis.fetch;
const requests: Array<{ url: string; init?: RequestInit }> = [];
const answer = (status: number, body: unknown) => (async (url: string, init?: RequestInit) => {
  requests.push({ url, init });
  return new Response(JSON.stringify(body), { status });
}) as typeof fetch;

try {
  globalThis.fetch = answer(200, { events: 3, firstOccurredAt: '2026-10-11T12:00:00.000Z', lastOccurredAt: '2026-10-13T12:00:00.000Z' });
  assert.deepEqual(await fetchTrackerDataSummary(),
    { events: 3, firstOccurredAt: '2026-10-11T12:00:00.000Z', lastOccurredAt: '2026-10-13T12:00:00.000Z' });
  globalThis.fetch = answer(200, { events: 'many' });
  assert.equal(await fetchTrackerDataSummary(), null, 'a malformed answer hides the section');
  globalThis.fetch = answer(401, { error: 'Требуется вход' });
  assert.equal(await fetchTrackerDataSummary(), null);

  globalThis.fetch = answer(200, { deleted: 3 });
  assert.equal(await deleteTrackerData(), 3);
  const last = requests.at(-1);
  assert.equal(last?.init?.method, 'DELETE');
  assert.equal((last?.init?.headers as Record<string, string>)['X-CSRF-Request'], '1');
  globalThis.fetch = answer(503, { error: 'Не удалось удалить данные приложения' });
  await assert.rejects(deleteTrackerData(), /Не удалось удалить/);
} finally {
  globalThis.fetch = realFetch;
}

console.log('account tracker data client: ok');
