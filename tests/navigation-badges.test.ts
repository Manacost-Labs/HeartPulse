import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPACT_NAVIGATION_ATTRIBUTE, COMPACT_NAVIGATION_KEY, COMPACT_NAVIGATION_SCRIPT } from '../src/app/shell/navigationPreference.js';

test('the head script applies only the remembered compact choice and never throws', () => {
  const run = (stored: string | null, throws = false) => {
    const attributes = new Set<string>();
    const localStorage = { getItem: (key: string) => { if (throws) throw new Error('blocked'); return key === COMPACT_NAVIGATION_KEY ? stored : null; } };
    const document = { documentElement: { setAttribute: (name: string) => attributes.add(name) } };
    new Function('localStorage', 'document', COMPACT_NAVIGATION_SCRIPT)(localStorage, document);
    return attributes.has(COMPACT_NAVIGATION_ATTRIBUTE);
  };
  assert.equal(run('1'), true);
  assert.equal(run(null), false);
  assert.equal(run('0'), false);
  assert.equal(run('1', true), false);
});
