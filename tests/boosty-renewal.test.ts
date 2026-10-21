import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeBoostyRenewal } from '../server/modules/subscription/public.js';

test('only a real boolean renewal flag is kept', () => {
  assert.deepEqual(normalizeBoostyRenewal({ willRenew: true }), { willRenew: true });
  assert.deepEqual(normalizeBoostyRenewal({ willRenew: false }), { willRenew: false });
  for (const subscriber of [{ willRenew: 'true' }, { willRenew: 1 }, { willRenew: null }, {}, null, [], 'x'])
    assert.deepEqual(normalizeBoostyRenewal(subscriber), {}, `${JSON.stringify(subscriber)} carries no renewal`);
});

test('the Boosty check adds the flag beside the payment date and nothing reads it for access', () => {
  const server = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
  const check = server.slice(server.indexOf('async function checkBoostySubscription'), server.indexOf('async function', server.indexOf('async function checkBoostySubscription') + 10));
  assert.match(check, /const renewal = normalizeBoostyRenewal\(subscriber\);/);
  assert.match(check, /\.\.\.paymentDates,\s*\.\.\.renewal,/);
  const entitlements = readFileSync(new URL('../server/modules/readerEntitlements/public.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(entitlements, /willRenew/, 'access evidence stays independent of the renewal flag');
});
