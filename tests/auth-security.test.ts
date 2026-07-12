import assert from 'node:assert/strict';
import {
  decodeSignedStateCookie,
  encodeSignedStateCookie,
  safeAuthReturnTo,
} from '../server/authRedirect.js';

const fallback = '/?login&telegram=ok';

assert.equal(safeAuthReturnTo('/tierlist?source=hsreplay#cards'), '/tierlist?source=hsreplay#cards');
assert.equal(safeAuthReturnTo(' /classes '), '/classes');
for (const unsafe of [
  'https://evil.example/steal',
  '//evil.example/steal',
  '///evil.example/steal',
  '/\\evil.example/steal',
  '/%5cevil.example/steal',
  'javascript:alert(1)',
  '/safe\nLocation: https://evil.example',
]) {
  assert.equal(safeAuthReturnTo(unsafe), fallback, `unsafe returnTo must be rejected: ${JSON.stringify(unsafe)}`);
}

const secret = 'test-only-oidc-secret';
const state = {
  state: 'state-value',
  nonce: 'nonce-value',
  codeVerifier: 'verifier-value',
  returnTo: '/legendaries',
  expiresAt: Date.now() + 60_000,
};
const signed = encodeSignedStateCookie({ states: [state] }, secret);
assert.deepEqual(decodeSignedStateCookie(signed, secret), { states: [state] });
assert.equal(decodeSignedStateCookie(signed, 'wrong-secret'), null);
assert.equal(decodeSignedStateCookie(signed.replace(/.$/, char => char === 'a' ? 'b' : 'a'), secret), null);
assert.equal(decodeSignedStateCookie(signed.split('.')[0], secret), null, 'unsigned legacy cookie must be rejected');
assert.equal(decodeSignedStateCookie(`x.${'a'.repeat(9_000)}`, secret), null, 'oversized cookie must be rejected');
assert.throws(() => encodeSignedStateCookie(state, ''), /secret is required/);

console.log('authentication redirect and signed-state tests passed');
