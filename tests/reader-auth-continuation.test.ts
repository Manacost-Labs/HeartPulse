import assert from 'node:assert/strict';
import test from 'node:test';
import { incomingReaderInteraction, pendingReaderInteraction, readerAuthContinuation } from '../src/modules/browserIdentity/continuation.js';
import { fetchReaderSignInSite } from '../src/modules/browserIdentity/signInSite.js';

test('login continuation preserves only a bounded handle through social callback, expires and consumes once', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const uid = 'a'.repeat(32);
  assert.equal(readerAuthContinuation('?login', storage, false, 1000, `#reader_interaction=${uid}`), null);
  assert.equal(readerAuthContinuation('?login&telegram=ok', storage, true, 2000), `/identity/interaction/${uid}`);
  assert.equal(readerAuthContinuation('?login', storage, true, 2000), null);
  readerAuthContinuation('?login', storage, false, 1000, `#reader_interaction=${uid}`);
  assert.equal(readerAuthContinuation('?login', storage, true, 601000), null);
  for (const malicious of ['//evil.test', '../bad', '%2f%2fevil.test', 'x&reader_interaction=y']) {
    assert.equal(readerAuthContinuation('?login', storage, true, 2000, `#reader_interaction=${malicious}`), null);
  }
  assert.equal(readerAuthContinuation(`?login&reader_interaction=${uid}`, storage, true, 2000), null);
  assert.equal(values.size, 0, 'query-only handles must never be persisted');
});

test('browser storage getter denial does not break normal reading or login', () => {
  const denied = () => { throw new DOMException('Storage disabled', 'SecurityError'); };
  assert.equal(readerAuthContinuation('', denied, false), null);
  assert.equal(readerAuthContinuation('?login', denied, true, 2000, `#reader_interaction=${'x'.repeat(32)}`), null);
});

function memoryStorage() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  return { values, storage };
}

test('pending interaction is read without consuming, extending or clearing it', () => {
  const { values, storage } = memoryStorage();
  const uid = 'c'.repeat(32);
  assert.equal(pendingReaderInteraction(storage, 1000), null);
  readerAuthContinuation('?login', storage, false, 1000, `#reader_interaction=${uid}`);
  const stored = values.get('hp_reader_interaction');
  assert.equal(pendingReaderInteraction(storage, 2000), uid);
  assert.equal(pendingReaderInteraction(storage, 2000), uid, 'reading twice keeps the handle');
  assert.equal(values.get('hp_reader_interaction'), stored, 'the stored value is untouched');
  assert.equal(pendingReaderInteraction(storage, 601000), null, 'an expired handle is not reported');
  assert.equal(values.get('hp_reader_interaction'), stored, 'an expired handle is left for readerAuthContinuation to discard');
  values.set('hp_reader_interaction', JSON.stringify({ uid: '//evil.test', expiresAt: 9e12 }));
  assert.equal(pendingReaderInteraction(storage, 2000), null);
  values.set('hp_reader_interaction', 'not json');
  assert.equal(pendingReaderInteraction(storage, 2000), null);
  assert.equal(pendingReaderInteraction(() => { throw new DOMException('Storage disabled', 'SecurityError'); }, 2000), null);
});

test('an incoming interaction is known before anything is captured, from the fragment or from storage, and nothing is written', () => {
  const { values, storage } = memoryStorage();
  const uid = 'f'.repeat(32);
  assert.equal(incomingReaderInteraction('?login', `#reader_interaction=${uid}`, storage, 1000), uid, 'the fragment of /?login counts');
  assert.equal(values.size, 0, 'looking ahead writes nothing');
  assert.equal(incomingReaderInteraction('', `#reader_interaction=${uid}`, storage, 1000), null, 'the fragment counts only on the login page');
  assert.equal(incomingReaderInteraction(`?login&reader_interaction=${uid}`, `#reader_interaction=${uid}`, storage, 1000), null, 'a query handle disables the fragment');
  assert.equal(incomingReaderInteraction('?login', '#reader_interaction=short', storage, 1000), null);
  assert.equal(incomingReaderInteraction('?login', '', storage, 1000), null);
  readerAuthContinuation('?login', storage, false, 1000, `#reader_interaction=${uid}`);
  assert.equal(incomingReaderInteraction('?login', '', storage, 2000), uid, 'after the fragment is removed the stored handle remains');
  assert.equal(incomingReaderInteraction('?login', '', storage, 601000), null, 'an expired handle is not reported');
  assert.equal(incomingReaderInteraction('?login', '', () => { throw new DOMException('Storage disabled', 'SecurityError'); }, 2000), null);
});

type FetchCall = { input: string; init: RequestInit | undefined };
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: string, init?: RequestInit) => { calls.push({ input, init }); return respond(); }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test('sign-in site is requested for this browser only and shown exactly as the server names it', async () => {
  const uid = 'd'.repeat(24);
  const { calls, fetchImpl } = fakeFetch(() => Response.json({ name: 'Манакост', host: 'hs-manacost.ru' }));
  assert.deepEqual(await fetchReaderSignInSite(uid, undefined, fetchImpl), { name: 'Манакост', host: 'hs-manacost.ru' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, `/identity/interaction/${uid}/client`);
  assert.equal(calls[0].init?.credentials, 'same-origin');
  assert.equal(calls[0].init?.cache, 'no-store');
  assert.deepEqual(await fetchReaderSignInSite(uid, undefined, fakeFetch(() => Response.json({ name: 'a.example', host: 'a.example', extra: 'x' })).fetchImpl),
    { name: 'a.example', host: 'a.example' }, 'unknown fields are dropped');
});

test('anything but a well-formed answer means no sign-in site', async () => {
  const uid = 'e'.repeat(24);
  const answers: Array<() => Response | Promise<Response>> = [
    () => new Response(null, { status: 404 }),
    () => new Response('boom', { status: 500 }),
    () => Response.json({ name: 'Манакост', host: 'hs-manacost.ru' }, { status: 500 }),
    () => new Response('<html>', { status: 200 }),
    () => Response.json(null),
    () => Response.json({ name: 'Манакост' }),
    () => Response.json({ name: 7, host: 'hs-manacost.ru' }),
    () => Response.json({ name: '', host: 'hs-manacost.ru' }),
    () => Response.json({ name: 'Манакост', host: '' }),
    () => Response.json({ name: 'x'.repeat(201), host: 'hs-manacost.ru' }),
    () => Response.json({ name: 'Манакост', host: 'hs-manacost.ru/path?x=1' }),
    () => Response.json({ name: 'Манакост', host: 'https://hs-manacost.ru' }),
    () => { throw new TypeError('Failed to fetch'); },
  ];
  for (const answer of answers) assert.equal(await fetchReaderSignInSite(uid, undefined, fakeFetch(answer).fetchImpl), null);
  for (const bad of ['', 'short', '../x', '//evil.test', 'x'.repeat(129)]) {
    const { calls, fetchImpl } = fakeFetch(() => Response.json({ name: 'Манакост', host: 'hs-manacost.ru' }));
    assert.equal(await fetchReaderSignInSite(bad, undefined, fetchImpl), null);
    assert.equal(calls.length, 0, 'a malformed handle never reaches the network');
  }
});
