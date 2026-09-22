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

const serverSource = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
assert.match(
  serverSource,
  /AUTH_COOKIE_NAME = APP_URL\.startsWith\('https:\/\/'\)[\s\S]{0,100}__Host-manacost_auth_token/,
  'production sessions must use a sibling-resistant __Host- cookie name',
);
assert.match(
  serverSource,
  /cookieName: AUTH_COOKIE_NAME/,
  'authentication must read only the environment-selected primary session cookie',
);
assert.match(
  serverSource,
  /authCookiePresent:\s*cookieValues\([\s\S]{0,160}AUTH_COOKIE_NAME,[\s\S]{0,40}\.length > 0/,
  'CSRF detection must inspect all duplicate auth cookies, matching authentication semantics',
);
assert.match(
  serverSource,
  /try \{\s*const oidcState = telegramOidcFlow\.take/,
  'malformed OIDC cookies must remain inside the async callback error boundary',
);

console.log('authentication redirect and signed-state tests passed');
