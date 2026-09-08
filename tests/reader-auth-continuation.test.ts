import assert from 'node:assert/strict';
import test from 'node:test';
import { readerAuthContinuation } from '../src/modules/browserIdentity/continuation.js';

test('login continuation preserves only a bounded handle through social callback, expires and consumes once', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const uid = 'a'.repeat(32);
  assert.equal(readerAuthContinuation(`?login&reader_interaction=${uid}`, storage, false, 1000), null);
  assert.equal(readerAuthContinuation('?login&telegram=ok', storage, true, 2000), `/identity/interaction/${uid}`);
  assert.equal(readerAuthContinuation('?login', storage, true, 2000), null);
  readerAuthContinuation(`?login&reader_interaction=${uid}`, storage, false, 1000);
  assert.equal(readerAuthContinuation('?login', storage, true, 601000), null);
  for (const malicious of ['//evil.test', '../bad', '%2f%2fevil.test', 'x&reader_interaction=y']) {
    assert.equal(readerAuthContinuation(`?login&reader_interaction=${malicious}`, storage, true), null);
  }
});

test('browser storage getter denial does not break normal reading or login', () => {
  const denied = () => { throw new DOMException('Storage disabled', 'SecurityError'); };
  assert.equal(readerAuthContinuation('', denied, false), null);
  assert.equal(readerAuthContinuation(`?login&reader_interaction=${'x'.repeat(32)}`, denied, true), null);
});
