import assert from 'node:assert/strict';
import {
  ACCESS_REJECTED_EVENT,
  RequestDeadlineError,
  RequestNetworkError,
  fetchWithDeadline,
} from '../src/shared/http/fetchWithDeadline.js';

type FakeFetch = (input: string, init: RequestInit) => Promise<Response>;
let fake: FakeFetch = async () => new Response('{}');
const calls: RequestInit[] = [];
globalThis.fetch = ((input: string, init: RequestInit) => { calls.push(init); return fake(input, init); }) as typeof fetch;
const events: Array<{ status: number; url: string }> = [];
const target = new EventTarget();
target.addEventListener(ACCESS_REJECTED_EVENT, event => events.push((event as CustomEvent).detail));
(globalThis as { window?: unknown }).window = target;

/** A real pending request holds a socket open; the fakes hold the event loop the same way until aborted. */
const holdOpen = (signal: AbortSignal | null | undefined) => {
  const handle = setInterval(() => undefined, 1_000);
  signal?.addEventListener('abort', () => clearInterval(handle));
  if (signal?.aborted) clearInterval(handle);
};

/** Resolves only when the request is aborted, like a stalled connection. */
const hang: FakeFetch = (_input, init) => new Promise((_resolve, reject) => {
  const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
  holdOpen(init.signal);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort);
});

// A normal answer passes through untouched, with same-origin credentials by default.
fake = async () => new Response('{"ok":true}', { status: 200 });
const ok = await fetchWithDeadline('/api/admin/crm/segments', { method: 'GET' });
assert.equal(ok.status, 200);
assert.deepEqual(await ok.json(), { ok: true });
assert.equal(calls.at(-1)?.credentials, 'same-origin');
assert.equal(calls.at(-1)?.method, 'GET');

// A stalled request ends with a readable deadline error instead of waiting forever.
fake = hang;
const started = Date.now();
await assert.rejects(fetchWithDeadline('/api/admin/contests', { deadlineMs: 40 }), (error: unknown) => {
  assert.ok(error instanceof RequestDeadlineError);
  assert.equal(error.message, 'Сервер не ответил за 1 секунду. Проверьте соединение и повторите.');
  return true;
});
assert.ok(Date.now() - started < 1000);
assert.equal(new RequestDeadlineError(20).message, 'Сервер не ответил за 20 секунд. Проверьте соединение и повторите.');
// A timed-out change may have been applied on the server: the person is told to check before repeating it.
await assert.rejects(fetchWithDeadline('/api/admin-articles', { method: 'post', deadlineMs: 30 }),
  /Сервер не ответил за 1 секунду\. Изменение могло сохраниться: обновите данные, прежде чем повторять\./);

// The caller's own cancellation stays an AbortError, so «latest request wins» code keeps working.
const caller = new AbortController();
const pending = fetchWithDeadline('/api/admin/archetype-translations', { signal: caller.signal, deadlineMs: 5_000 });
caller.abort();
await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
const preAborted = new AbortController();
preAborted.abort();
await assert.rejects(fetchWithDeadline('/api/admin/users', { signal: preAborted.signal }), (error: unknown) => (error as Error).name === 'AbortError');

// A dropped connection reads as a network problem, not as a stack trace.
fake = async () => { throw new TypeError('Failed to fetch'); };
await assert.rejects(fetchWithDeadline('/api/admin/users'), (error: unknown) => {
  assert.ok(error instanceof RequestNetworkError);
  assert.match(error.message, /Нет соединения с сервером/);
  return true;
});

// Other failures are not rewritten, including a TypeError that is a programming error rather than the network.
fake = async () => { throw new SyntaxError('broken'); };
await assert.rejects(fetchWithDeadline('/api/admin/users'), SyntaxError);
fake = async () => { throw new TypeError('Request with GET/HEAD method cannot have body.'); };
await assert.rejects(fetchWithDeadline('/api/admin/users'), (error: unknown) => error instanceof TypeError && !(error instanceof RequestNetworkError));

/** Headers arrive at once; the body never finishes and errors when the request is aborted, as fetch does. */
const stalledBody: FakeFetch = async (_input, init) => new Response(new ReadableStream({
  start(stream) {
    holdOpen(init.signal);
    stream.enqueue(new TextEncoder().encode('{"partial":'));
    init.signal?.addEventListener('abort', () => stream.error(init.signal?.reason));
  },
}));

// The deadline also covers the body: a response that stalls after its headers ends with the same message.
fake = stalledBody;
const slowBody = await fetchWithDeadline('/api/admin/boosty/subscribers', { deadlineMs: 40 });
await assert.rejects(slowBody.text(), (error: unknown) => error instanceof RequestDeadlineError && /Проверьте соединение/.test(error.message));

// Cancelling after the headers still stops the body, so an older search cannot land over a newer one.
const search = new AbortController();
const searchResponse = await fetchWithDeadline('/api/admin/mechanic-translations?q=a', { signal: search.signal, deadlineMs: 5_000 });
const reading = searchResponse.text();
search.abort();
await assert.rejects(reading, (error: unknown) => (error as Error).name === 'AbortError');

// 401 and 403 are announced once per response and still returned to the caller.
fake = async () => new Response('{"error":"Недостаточно прав"}', { status: 403 });
const denied = await fetchWithDeadline('/api/admin/crm/people/x');
assert.equal(denied.status, 403);
fake = async () => new Response('{}', { status: 401 });
await fetchWithDeadline('/api/admin-articles', { method: 'POST' });
fake = async () => new Response('{}', { status: 404 });
await fetchWithDeadline('/api/admin/missing');
assert.deepEqual(events, [{ status: 403, url: '/api/admin/crm/people/x' }, { status: 401, url: '/api/admin-articles' }]);

console.log('fetch with deadline: ok');
