import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const [payload, signature] = signed.split('.');
const tamperedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
assert.equal(decodeSignedStateCookie(`${payload}.${tamperedSignature}`, secret), null);
assert.equal(decodeSignedStateCookie(signed.split('.')[0], secret), null, 'unsigned legacy cookie must be rejected');
assert.equal(decodeSignedStateCookie(`x.${'a'.repeat(9_000)}`, secret), null, 'oversized cookie must be rejected');
assert.throws(() => encodeSignedStateCookie(state, ''), /secret is required/);

// Session cookie names, the cookie that authenticates and CSRF detection are
// exercised on the real server by tests/auth-session-cookies-integration.test.mjs.
// A malformed OIDC cookie decodes to null today, so nothing there can prove the
// callback keeps it inside its error boundary; the source still guards that.
const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
assert.match(
  serverSource,
  /try \{\s*const oidcState = telegramOidcFlow\.take/,
  'malformed OIDC cookies must remain inside the async callback error boundary',
);

console.log('authentication redirect and signed-state tests passed');
